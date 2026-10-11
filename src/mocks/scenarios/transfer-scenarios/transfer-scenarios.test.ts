import type { GetTransferLimitsResponse } from "@/domains/account/api/get-transfer-limits/get-transfer-limits.type";
import type { RegisterApprovalKeysResponse } from "@/domains/approval/api/register-approval-keys/register-approval-keys.type";
import type { ApproveTransferResponse } from "@/domains/transfer/api/approve-transfer/approve-transfer.type";
import { CoolingOffReason } from "@/domains/transfer/api/create-transfer/create-transfer.type";
import {
  TransferFailureReason,
  TransferFunds,
  TransferStatus,
  type GetTransferResponse,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import type { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import {
  clearTransferScenario,
  demoBankNotifications,
  pickTransferScenario,
} from "@/mocks/bank/bank";
import { toMalaysiaIso } from "@/mocks/bank/malaysia-time/malaysia-time";
import { DEMO_PIN } from "@/mocks/bank/seed/seed";
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
} from "@/test/mock-bank/mock-bank";

// eslint-disable-next-line fe/file-layout -- read at load by an it.each table
const HOUR_MS = 60 * 60 * 1000;

afterEach(() => {
  jest.restoreAllMocks();
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

  it.each<[`${TransferScenarioId}`, CoolingOffReason, number]>([
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
      clockAt(TEST_START_MS);
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

      const during = await transferAt(TEST_START_MS + lastsMs - 1);
      const after = await transferAt(TEST_START_MS + lastsMs);

      expect(during.status).toBe(403);
      expect(during.body.error).toMatchObject({
        code: "COOLING_OFF",
        reason,
        until: toMalaysiaIso(TEST_START_MS + lastsMs),
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

  it.each<[`${TransferScenarioId}`, Partial<BankErrorBody["error"]>]>([
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

  it("transfer.account_locked leaves a refused transfer approvable to the last millisecond of its 60 seconds, then lets it expire", async () => {
    clockAt(TEST_START_MS);
    const { biometricKeyId } = await pairTestPhone();
    const key = { kind: "biometric" as const, keyId: biometricKeyId };
    const approvedInTime = await startTestTransfer(2_550);
    const leftToLapse = await startTestTransfer(2_550);
    const sendSignedApproval = (started: typeof approvedInTime) =>
      sendToBank<ApproveTransferResponse & BankErrorBody>(
        "POST",
        started.approvalPath,
        { body: signTestApproval(started, key) },
      );
    pickTransferScenario("transfer.account_locked");

    const lockRefusals = [
      await sendSignedApproval(approvedInTime),
      await sendSignedApproval(leftToLapse),
    ];
    clearTransferScenario();
    clockAt(TEST_START_MS + 59_999);
    const lastMoment = await sendSignedApproval(approvedInTime);
    clockAt(TEST_START_MS + 60_000);
    const { body: atSixty } = await readTransfer(
      leftToLapse.created.transfer.transferId,
    );

    expect(lockRefusals.map(({ body }) => body.error.code)).toEqual([
      "ACCOUNT_LOCKED",
      "ACCOUNT_LOCKED",
    ]);
    expect(lastMoment.body.transfer.status).toBe(TransferStatus.Completed);
    expect(atSixty.transfer).toMatchObject({
      status: TransferStatus.Expired,
      funds: TransferFunds.NotDebited,
      version: 2,
    });
  });

  it("transfer.account_locked answers an approval alike whatever PIN it carries, spending no PIN try", async () => {
    const { possessionKeyId } = await pairTestPhone();
    const started = await startTestTransfer(2_550);
    const approval = signTestApproval(started, {
      kind: "possession",
      keyId: possessionKeyId,
    });
    const approveWithPin = (pin: string) =>
      sendToBank<BankErrorBody>("POST", started.approvalPath, {
        body: { ...approval, pin },
      });
    pickTransferScenario("transfer.account_locked");

    const withRightPin = await approveWithPin(DEMO_PIN);
    const withWrongPin = await approveWithPin("135790");
    clearTransferScenario();
    const withWrongPinAfterLift = await approveWithPin("135790");

    expect([withRightPin.status, withRightPin.body.error.code]).toEqual([
      403,
      "ACCOUNT_LOCKED",
    ]);
    expect(withWrongPin).toEqual(withRightPin);
    expect(withWrongPinAfterLift.body.error).toMatchObject({
      code: "PIN_INCORRECT",
      attemptsRemaining: 2,
    });
  });

  it.each<`${TransferScenarioId}`>([
    "transfer.account_locked",
    "transfer.cooling_off_new_phone",
    "transfer.cooling_off_new_account",
  ])(
    "%s, begun after the approval executed, still answers a retry with the completed transfer",
    async (scenarioId) => {
      const ready = await transferReadyToApprove();
      const balanceBefore = await readBankBalanceMinor();
      pickTransferScenario("transfer.approval_unanswered");
      await expect(ready.approvalRequest("lost-approval")).rejects.toThrow();
      pickTransferScenario(scenarioId);

      // ⛔ A fresh key: "lost-approval" would replay the stored answer and never meet the hold.
      const retriedApproval = await ready.approve();

      expect(retriedApproval.status).toBe(200);
      expect(retriedApproval.body.transfer).toMatchObject({
        status: TransferStatus.Completed,
        funds: TransferFunds.Debited,
        version: 2,
      });
      expect(await readBankBalanceMinor()).toBe(balanceBefore - 2_550);
    },
  );

  it("transfer.approval_key_unknown forgets keys from before it began, until the PIN registers new ones", async () => {
    clockAt(TEST_START_MS);
    const ready = await transferReadyToApprove();
    clockAt(TEST_START_MS + 1_000);
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

  it.each<[`${TransferScenarioId}`, TransferFailureReason]>([
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
        version: 2,
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

  it.each<[`${TransferScenarioId}`, boolean]>([
    ["transfer.processing", false],
    ["transfer.held_for_review", true],
  ])(
    "%s debits, then completes twenty seconds later",
    async (scenarioId, underReview) => {
      clockAt(TEST_START_MS);
      const ready = await transferReadyToApprove();
      const balanceBefore = await readBankBalanceMinor();
      pickTransferScenario(scenarioId);

      const { body: approved } = await ready.approve();
      clockAt(TEST_START_MS + 19_999);
      const { body: before } = await readTransfer(ready.transferId);
      clockAt(TEST_START_MS + 20_000);
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
    clockAt(TEST_START_MS);
    const ready = await transferReadyToApprove();
    const balanceBefore = await readBankBalanceMinor();
    pickTransferScenario("transfer.refunded_after_processing");

    const { body: approved } = await ready.approve();
    clockAt(TEST_START_MS + 20_000);
    const { body: failed } = await readTransfer(ready.transferId);
    const balanceWhilePending = await readBankBalanceMinor();
    clockAt(TEST_START_MS + 30_000);
    const { body: refunded } = await readTransfer(ready.transferId);

    expect(failed.transfer).toMatchObject({
      status: TransferStatus.Unsuccessful,
      funds: TransferFunds.RefundPending,
      version: approved.transfer.version + 1,
    });
    expect(balanceWhilePending).toBe(balanceBefore - 2_550);
    expect(refunded.transfer).toMatchObject({
      funds: TransferFunds.Refunded,
      version: approved.transfer.version + 2,
    });
    expect(await readBankBalanceMinor()).toBe(balanceBefore);
  });
});

const TEST_START_MS = Date.parse("2026-10-08T10:00:00+08:00");

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
