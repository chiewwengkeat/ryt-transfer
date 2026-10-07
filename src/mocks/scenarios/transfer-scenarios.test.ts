import type { GetTransferLimitsResponse } from "@/domains/account/api/get-transfer-limits/get-transfer-limits.type";
import type { ApproveTransferResponse } from "@/domains/transfer/api/approve-transfer/approve-transfer.type";
import {
  CoolingOffReason,
  type CreateTransferResponse,
} from "@/domains/transfer/api/create-transfer/create-transfer.type";
import {
  TransferFailureReason,
  TransferFunds,
  TransferStatus,
  type GetTransferResponse,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import type { RegisterApprovalKeysResponse } from "@/domains/approval/api/register-approval-keys/register-approval-keys.type";
import { toMalaysiaIso } from "@/mocks/bank/malaysia-time";
import { DEMO_PIN } from "@/mocks/bank/seed";
import {
  clearTransferScenario,
  demoBankNotifications,
  pickTransferScenario,
} from "@/mocks/demo-bank";
import {
  BANK_ORIGIN,
  lookUpTestRecipient,
  pairTestPhone,
  phonePublicKeySpki,
  readBankBalanceMinor,
  sendToBank,
  signTestApproval,
  startTestTransfer,
  type BankErrorBody,
} from "@/test/bank-client";

import type { TransferScenarioId } from "./transfer-scenarios";

const T0 = Date.parse("2026-10-08T10:00:00+08:00");
const HOUR_MS = 60 * 60 * 1000;

afterEach(() => {
  jest.restoreAllMocks();
});

function clockAt(epochMs: number) {
  jest.spyOn(Date, "now").mockReturnValue(epochMs);
}

const readTransfer = (transferId: string) =>
  sendToBank<GetTransferResponse & BankErrorBody>(
    "GET",
    `/transfers/${transferId}`,
  );

async function transferReadyToApprove(amountMinor = 2_550) {
  const { biometricKeyId } = await pairTestPhone();
  const started = await startTestTransfer(amountMinor);
  const approval = signTestApproval(started, {
    kind: "biometric",
    keyId: biometricKeyId,
  });
  return {
    started,
    transferId: started.created.transfer.transferId,
    approve: (idempotencyKey?: string) =>
      sendToBank<ApproveTransferResponse & BankErrorBody>(
        "POST",
        started.approvalPath,
        { body: approval, idempotencyKey },
      ),
    approvalRequest: (idempotencyKey: string) =>
      fetch(`${BANK_ORIGIN}${started.approvalPath}`, {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify(approval),
      }),
  };
}

describe("overlays that answer for the connection", () => {
  it.each<[TransferScenarioId, "GET" | "POST", string, number, string]>([
    [
      "transfer.balance_unavailable",
      "GET",
      "/accounts/primary",
      500,
      "INTERNAL_ERROR",
    ],
    [
      "transfer.balance_unavailable",
      "GET",
      "/transfer-limits",
      500,
      "INTERNAL_ERROR",
    ],
    [
      "transfer.under_maintenance",
      "GET",
      "/transfer-limits",
      503,
      "SERVICE_UNAVAILABLE",
    ],
    [
      "transfer.under_maintenance",
      "POST",
      "/transfers",
      503,
      "SERVICE_UNAVAILABLE",
    ],
    [
      "transfer.start_unexpected",
      "GET",
      "/accounts/primary",
      400,
      "NEW_BANK_CODE",
    ],
    [
      "transfer.recipient_unexpected",
      "GET",
      "/recipients/recent",
      400,
      "NEW_BANK_CODE",
    ],
    [
      "transfer.amount_unexpected",
      "GET",
      "/transfer-limits",
      400,
      "NEW_BANK_CODE",
    ],
    [
      "transfer.recipient_not_found",
      "POST",
      "/recipients/lookup",
      404,
      "RECIPIENT_NOT_FOUND",
    ],
    [
      "transfer.name_check_unavailable",
      "POST",
      "/recipients/lookup",
      503,
      "NAME_ENQUIRY_UNAVAILABLE",
    ],
    [
      "transfer.too_many_name_checks",
      "POST",
      "/recipients/lookup",
      429,
      "TOO_MANY_LOOKUPS",
    ],
    [
      "transfer.balance_or_limit_short_at_confirmation",
      "POST",
      "/transfers",
      422,
      "INSUFFICIENT_FUNDS",
    ],
    [
      "transfer.name_check_expired",
      "POST",
      "/transfers",
      422,
      "RECIPIENT_REF_EXPIRED",
    ],
    ["transfer.review_unexpected", "POST", "/transfers", 400, "NEW_BANK_CODE"],
    [
      "transfer.outcome_unexpected",
      "GET",
      "/transfers/trf_any",
      400,
      "NEW_BANK_CODE",
    ],
    [
      "transfer.session_ended",
      "GET",
      "/accounts/primary",
      401,
      "SESSION_ENDED",
    ],
    ["transfer.session_ended", "POST", "/approval-keys", 401, "SESSION_ENDED"],
  ])(
    "%s answers %s %s with %i %s",
    async (scenarioId, method, path, status, code) => {
      pickTransferScenario(scenarioId);

      const answer = await sendToBank<BankErrorBody>(method, path, {
        body: method === "POST" ? {} : undefined,
      });

      expect([answer.status, answer.body.error.code]).toEqual([status, code]);
    },
  );

  it("says until when maintenance lasts, two hours from when it began", async () => {
    clockAt(T0);
    pickTransferScenario("transfer.under_maintenance");

    const { body } = await sendToBank<BankErrorBody>("GET", "/transfer-limits");

    expect(body.error.until).toBe(toMalaysiaIso(T0 + 2 * HOUR_MS));
  });

  it("fails every request, reads and writes alike, when offline", async () => {
    pickTransferScenario("transfer.offline");

    await expect(fetch(`${BANK_ORIGIN}/accounts/primary`)).rejects.toThrow();
    await expect(
      fetch(`${BANK_ORIGIN}/transfers`, { method: "POST", body: "{}" }),
    ).rejects.toThrow();
  });
});

describe("conditions the bank applies itself", () => {
  it("transfer.new_customer_daily_limit lowers today's limit to RM1,000 and enforces it", async () => {
    pickTransferScenario("transfer.new_customer_daily_limit");
    const lookup = await lookUpTestRecipient();

    const { body: limits } = await sendToBank<GetTransferLimitsResponse>(
      "GET",
      "/transfer-limits",
    );
    const refused = await sendToBank<BankErrorBody>("POST", "/transfers", {
      body: {
        recipientRef: lookup.recipientRef,
        amount: { minor: 100_001, currency: "MYR" },
      },
    });

    expect(limits.daily.limit.minor).toBe(100_000);
    expect(refused.body.error.code).toBe("DAILY_LIMIT_EXCEEDED");
  });

  it.each<[TransferScenarioId, CoolingOffReason, number]>([
    [
      "transfer.cooling_off_new_phone",
      CoolingOffReason.DevicePaired,
      11 * HOUR_MS,
    ],
    [
      "transfer.cooling_off_new_account",
      CoolingOffReason.NewAccount,
      0.75 * HOUR_MS,
    ],
  ])(
    "%s refuses transfers until the cooling-off ends",
    async (scenarioId, reason, lastsMs) => {
      clockAt(T0);
      pickTransferScenario(scenarioId);
      const transferAt = async (epochMs: number) => {
        clockAt(epochMs);
        const lookup = await lookUpTestRecipient();
        return sendToBank<BankErrorBody>("POST", "/transfers", {
          body: {
            recipientRef: lookup.recipientRef,
            amount: { minor: 1_000, currency: "MYR" },
          },
        });
      };

      const during = await transferAt(T0 + lastsMs - 1);
      const after = await transferAt(T0 + lastsMs);

      expect(during.status).toBe(403);
      expect(during.body.error).toMatchObject({
        code: "COOLING_OFF",
        reason,
        until: toMalaysiaIso(T0 + lastsMs),
      });
      expect(after.status).toBe(201);
    },
  );

  it("transfer.account_locked refuses every new transfer", async () => {
    pickTransferScenario("transfer.account_locked");
    const lookup = await lookUpTestRecipient();

    const refused = await sendToBank<BankErrorBody>("POST", "/transfers", {
      body: {
        recipientRef: lookup.recipientRef,
        amount: { minor: 1_000, currency: "MYR" },
      },
    });

    expect([refused.status, refused.body.error.code]).toEqual([
      403,
      "ACCOUNT_LOCKED",
    ]);
  });

  it.each<[TransferScenarioId, Partial<BankErrorBody["error"]>]>([
    ["transfer.account_locked", { code: "ACCOUNT_LOCKED" }],
    [
      "transfer.cooling_off_new_phone",
      { code: "COOLING_OFF", reason: CoolingOffReason.DevicePaired },
    ],
    [
      "transfer.cooling_off_new_account",
      { code: "COOLING_OFF", reason: CoolingOffReason.NewAccount },
    ],
  ])(
    "%s also refuses an approval arriving after it began, moving no money",
    async (scenarioId, refusal) => {
      const ready = await transferReadyToApprove();
      const balanceBefore = await readBankBalanceMinor();
      pickTransferScenario(scenarioId);

      const refused = await ready.approve();
      const { body } = await readTransfer(ready.transferId);

      expect(refused.status).toBe(403);
      expect(refused.body.error).toMatchObject(refusal);
      expect(body.transfer.funds).toBe(TransferFunds.NotDebited);
      expect(await readBankBalanceMinor()).toBe(balanceBefore);
    },
  );

  it("transfer.approval_key_unknown forgets keys from before it began, until the PIN registers new ones", async () => {
    clockAt(T0);
    const ready = await transferReadyToApprove();
    clockAt(T0 + 1_000);
    pickTransferScenario("transfer.approval_key_unknown");

    const unknown = await ready.approve();
    const withoutPin = await sendToBank<BankErrorBody>(
      "POST",
      "/approval-keys",
      {
        body: { biometricPublicKey: phonePublicKeySpki("biometric") },
      },
    );
    const { body: renewed } = await sendToBank<
      Required<RegisterApprovalKeysResponse>
    >("POST", "/approval-keys", {
      body: {
        biometricPublicKey: phonePublicKeySpki("biometric"),
        pin: DEMO_PIN,
      },
    });
    const { body: approved } = await sendToBank<ApproveTransferResponse>(
      "POST",
      ready.started.approvalPath,
      {
        body: signTestApproval(ready.started, {
          kind: "biometric",
          keyId: renewed.biometricKeyId,
        }),
      },
    );

    expect([unknown.status, unknown.body.error.code]).toEqual([
      409,
      "KEY_NOT_REGISTERED",
    ]);
    expect(withoutPin.body.error.code).toBe("PIN_REQUIRED");
    expect(approved.transfer.status).toBe(TransferStatus.Completed);
  });

  it("transfer.approval_expired refuses the approval as late and expires the transfer", async () => {
    const ready = await transferReadyToApprove();
    pickTransferScenario("transfer.approval_expired");

    const late = await ready.approve();
    const { body } = await readTransfer(ready.transferId);

    expect([late.status, late.body.error.code]).toEqual([
      410,
      "APPROVAL_EXPIRED",
    ]);
    expect(body.transfer.status).toBe(TransferStatus.Expired);
  });

  it("transfer.approval_not_verified refuses even a correct signature", async () => {
    const ready = await transferReadyToApprove();
    pickTransferScenario("transfer.approval_not_verified");

    const refused = await ready.approve();

    expect([refused.status, refused.body.error.code]).toEqual([
      403,
      "APPROVAL_INVALID",
    ]);
  });

  it.each<[TransferScenarioId, TransferFailureReason]>([
    [
      "transfer.balance_or_limit_short_at_approval",
      TransferFailureReason.InsufficientFunds,
    ],
    ["transfer.fraud_blocked", TransferFailureReason.FraudBlocked],
    [
      "transfer.recipient_account_inactive",
      TransferFailureReason.RecipientAccountInactive,
    ],
  ])(
    "%s ends the transfer unsuccessful without debiting it",
    async (scenarioId, failureReason) => {
      const ready = await transferReadyToApprove();
      const balanceBefore = await readBankBalanceMinor();
      pickTransferScenario(scenarioId);

      const { body } = await ready.approve();

      expect(body.transfer).toMatchObject({
        status: TransferStatus.Unsuccessful,
        funds: TransferFunds.NotDebited,
        failureReason,
      });
      expect(await readBankBalanceMinor()).toBe(balanceBefore);
    },
  );

  it("transfer.fraud_blocked tells the customer the bank will contact them", async () => {
    const ready = await transferReadyToApprove();
    pickTransferScenario("transfer.fraud_blocked");

    await ready.approve();

    expect(demoBankNotifications()).toEqual([
      expect.objectContaining({
        message: expect.stringContaining("We will contact you") as string,
      }),
    ]);
  });

  it.each<[TransferScenarioId, boolean]>([
    ["transfer.processing", false],
    ["transfer.held_for_review", true],
  ])(
    "%s debits, then completes twenty seconds later",
    async (scenarioId, underReview) => {
      clockAt(T0);
      const ready = await transferReadyToApprove();
      const balanceBefore = await readBankBalanceMinor();
      pickTransferScenario(scenarioId);

      const { body: approved } = await ready.approve();
      clockAt(T0 + 19_999);
      const { body: before } = await readTransfer(ready.transferId);
      clockAt(T0 + 20_000);
      const { body: after } = await readTransfer(ready.transferId);

      expect(approved.transfer).toMatchObject({
        status: TransferStatus.Processing,
        funds: TransferFunds.Debited,
      });
      expect(approved.transfer.underReview ?? false).toBe(underReview);
      expect(before.transfer.status).toBe(TransferStatus.Processing);
      expect(after.transfer).toMatchObject({
        status: TransferStatus.Completed,
        funds: TransferFunds.Debited,
        version: approved.transfer.version + 1,
      });
      expect(after.transfer.underReview).toBeUndefined();
      expect(await readBankBalanceMinor()).toBe(balanceBefore - 2_550);
    },
  );

  it("transfer.refunded_after_processing fails after processing, then refunds the money", async () => {
    clockAt(T0);
    const ready = await transferReadyToApprove();
    const balanceBefore = await readBankBalanceMinor();
    pickTransferScenario("transfer.refunded_after_processing");

    await ready.approve();
    clockAt(T0 + 20_000);
    const { body: failed } = await readTransfer(ready.transferId);
    const balanceWhilePending = await readBankBalanceMinor();
    clockAt(T0 + 30_000);
    const { body: refunded } = await readTransfer(ready.transferId);

    expect(failed.transfer).toMatchObject({
      status: TransferStatus.Unsuccessful,
      funds: TransferFunds.RefundPending,
    });
    expect(balanceWhilePending).toBe(balanceBefore - 2_550);
    expect(refunded.transfer.funds).toBe(TransferFunds.Refunded);
    expect(await readBankBalanceMinor()).toBe(balanceBefore);
  });
});

describe("overlays that let the bank commit, then lose or garble its answer", () => {
  it("transfer.confirmation_unanswered creates the transfer once, however often the answer is lost", async () => {
    const lookup = await lookUpTestRecipient();
    const body = JSON.stringify({
      recipientRef: lookup.recipientRef,
      amount: { minor: 1_000, currency: "MYR" },
    });
    const create = () =>
      fetch(`${BANK_ORIGIN}/transfers`, {
        method: "POST",
        headers: { "Idempotency-Key": "lost-create" },
        body,
      });
    pickTransferScenario("transfer.confirmation_unanswered");

    await expect(create()).rejects.toThrow();
    await expect(create()).rejects.toThrow();
    clearTransferScenario();
    const answered = (await (await create()).json()) as CreateTransferResponse;

    expect(answered.transfer.status).toBe(TransferStatus.AwaitingApproval);
    expect(answered.transfer.version).toBe(1);
  });

  it("transfer.approval_unanswered debits once while every answer is lost", async () => {
    const ready = await transferReadyToApprove();
    const balanceBefore = await readBankBalanceMinor();
    pickTransferScenario("transfer.approval_unanswered");

    await expect(ready.approvalRequest("lost-approval")).rejects.toThrow();
    await expect(ready.approvalRequest("lost-approval")).rejects.toThrow();
    await expect(ready.approvalRequest("another-attempt")).rejects.toThrow();
    clearTransferScenario();
    const { body } = await readTransfer(ready.transferId);

    expect(body.transfer.status).toBe(TransferStatus.Completed);
    expect(await readBankBalanceMinor()).toBe(balanceBefore - 2_550);
  });

  it("transfer.status_unreachable commits the approval, then loses every answer, checks included", async () => {
    const ready = await transferReadyToApprove();
    const balanceBefore = await readBankBalanceMinor();
    pickTransferScenario("transfer.status_unreachable");

    await expect(ready.approvalRequest("lost-approval")).rejects.toThrow();
    await expect(readTransfer(ready.transferId)).rejects.toThrow();
    expect(await readBankBalanceMinor()).toBe(balanceBefore - 2_550);
  });

  it.each<[TransferScenarioId, number, string]>([
    ["transfer.last_transfer_not_found", 404, "TRANSFER_NOT_FOUND"],
    ["transfer.recovery_unexpected", 400, "NEW_BANK_CODE"],
  ])(
    "%s commits the approval, loses its answer, then answers the check with %i %s",
    async (scenarioId, checkStatus, checkCode) => {
      const ready = await transferReadyToApprove();
      const balanceBefore = await readBankBalanceMinor();
      pickTransferScenario(scenarioId);

      await expect(ready.approvalRequest("lost-approval")).rejects.toThrow();
      const check = await readTransfer(ready.transferId);

      expect([check.status, check.body.error.code]).toEqual([
        checkStatus,
        checkCode,
      ]);
      expect(await readBankBalanceMinor()).toBe(balanceBefore - 2_550);
    },
  );

  it("transfer.approval_unknown_answer commits the approval but answers with a code the app never learned", async () => {
    const ready = await transferReadyToApprove();
    const balanceBefore = await readBankBalanceMinor();
    pickTransferScenario("transfer.approval_unknown_answer");

    const garbled = await ready.approve();

    expect([garbled.status, garbled.body.error.code]).toEqual([
      400,
      "NEW_BANK_CODE",
    ]);
    expect(await readBankBalanceMinor()).toBe(balanceBefore - 2_550);
  });
});
