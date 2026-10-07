import type { GetPrimaryAccountResponse } from "@/domains/account/api/get-primary-account/get-primary-account.type";
import type { GetTransferLimitsResponse } from "@/domains/account/api/get-transfer-limits/get-transfer-limits.type";
import type { RegisterApprovalKeysResponse } from "@/domains/approval/api/register-approval-keys/register-approval-keys.type";
import type { ApproveTransferResponse } from "@/domains/transfer/api/approve-transfer/approve-transfer.type";
import type { CreateTransferResponse } from "@/domains/transfer/api/create-transfer/create-transfer.type";
import {
  TransferFailureReason,
  TransferFunds,
  TransferStatus,
  type GetTransferResponse,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import { bankPorts, bindBankPorts } from "@/mocks/bank/ports";
import { DEMO_PIN } from "@/mocks/bank/seed";
import { demoBankNotifications, unlockDemoPin } from "@/mocks/demo-bank";
import {
  lookUpTestRecipient,
  pairTestPhone,
  phonePublicKeySpki,
  sendToBank,
  signTestApproval,
  startTestTransfer,
  type BankErrorBody,
} from "@/test/bank-client";

afterEach(() => {
  jest.restoreAllMocks();
});

async function balanceMinor() {
  const { body } = await sendToBank<GetPrimaryAccountResponse>(
    "GET",
    "/accounts/primary",
  );
  return body.balance.minor;
}

async function usedTodayMinor() {
  const { body } = await sendToBank<GetTransferLimitsResponse>(
    "GET",
    "/transfer-limits",
  );
  return body.daily.usedToday.minor;
}

const errorCodeOf = ({ body }: { body: BankErrorBody }) => body.error.code;

it("creates a transfer awaiting approval and moves no money", async () => {
  const balanceBefore = await balanceMinor();

  const { created } = await startTestTransfer(2_550, { note: "Lunch" });

  expect(created).toMatchObject({
    transfer: {
      status: TransferStatus.AwaitingApproval,
      funds: TransferFunds.NotDebited,
      amount: { minor: 2_550, currency: "MYR" },
      note: "Lunch",
    },
    approval: { expiresInSeconds: 60 },
  });
  expect(await balanceMinor()).toBe(balanceBefore);
  expect(await usedTodayMinor()).toBe(0);
});

it("debits once when the approval verifies, however many approvals arrive", async () => {
  const { biometricKeyId } = await pairTestPhone();
  const balanceBefore = await balanceMinor();
  const started = await startTestTransfer(2_550);
  const approval = signTestApproval(started, {
    kind: "biometric",
    keyId: biometricKeyId,
  });

  const first = await sendToBank<ApproveTransferResponse>(
    "POST",
    started.approvalPath,
    { body: approval, idempotencyKey: "approve-once" },
  );
  const resent = await sendToBank<ApproveTransferResponse>(
    "POST",
    started.approvalPath,
    { body: approval, idempotencyKey: "approve-once" },
  );
  const retried = await sendToBank<ApproveTransferResponse>(
    "POST",
    started.approvalPath,
    { body: approval },
  );

  expect(first.body.transfer).toMatchObject({
    status: TransferStatus.Completed,
    funds: TransferFunds.Debited,
    version: 2,
  });
  expect(resent).toEqual(first);
  expect(retried.body.transfer).toEqual(first.body.transfer);
  expect(await balanceMinor()).toBe(balanceBefore - 2_550);
  expect(await usedTodayMinor()).toBe(2_550);
  expect(demoBankNotifications()).toEqual([
    expect.objectContaining({
      message: expect.stringContaining("You sent 25.50 MYR") as string,
    }),
  ]);
});

it("refuses a write without an Idempotency-Key, and a key reused for another body", async () => {
  const lookup = await lookUpTestRecipient();
  const transfer = (minor: number) => ({
    recipientRef: lookup.recipientRef,
    amount: { minor, currency: "MYR" },
  });

  const unkeyed = await sendToBank<BankErrorBody>("POST", "/transfers", {
    body: transfer(1_000),
    idempotencyKey: null,
  });
  await sendToBank("POST", "/transfers", {
    body: transfer(1_000),
    idempotencyKey: "reused",
  });
  const reused = await sendToBank<BankErrorBody>("POST", "/transfers", {
    body: transfer(2_000),
    idempotencyKey: "reused",
  });

  expect([unkeyed.status, errorCodeOf(unkeyed)]).toEqual([
    400,
    "INVALID_REQUEST",
  ]);
  expect([reused.status, errorCodeOf(reused)]).toEqual([
    409,
    "IDEMPOTENCY_KEY_REUSED",
  ]);
});

it.each([
  ["a note with symbols", { note: "Lunch!" }, "NOTE_INVALID"],
  ["an amount of zero", { minor: 0 }, "AMOUNT_INVALID"],
  ["an amount above RM50,000", { minor: 5_000_001 }, "ABOVE_PER_TRANSFER_MAX"],
  ["an amount above the balance", { minor: 1_300_000 }, "INSUFFICIENT_FUNDS"],
  ["an amount above today's limit", { minor: 600_000 }, "DAILY_LIMIT_EXCEEDED"],
])("refuses to create a transfer with %s", async (_, change, code) => {
  const lookup = await lookUpTestRecipient();

  const refused = await sendToBank<BankErrorBody>("POST", "/transfers", {
    body: {
      recipientRef: lookup.recipientRef,
      amount: {
        minor: "minor" in change ? change.minor : 1_000,
        currency: "MYR",
      },
      ...("note" in change && { note: change.note }),
    },
  });

  expect([refused.status, errorCodeOf(refused)]).toEqual([422, code]);
});

it("refuses to create a transfer once the name check is ten minutes old", async () => {
  const lookup = await lookUpTestRecipient();
  jest.spyOn(Date, "now").mockReturnValue(Date.now() + 600_000);

  const refused = await sendToBank<BankErrorBody>("POST", "/transfers", {
    body: {
      recipientRef: lookup.recipientRef,
      amount: { minor: 1_000, currency: "MYR" },
    },
  });

  expect([refused.status, errorCodeOf(refused)]).toEqual([
    422,
    "RECIPIENT_REF_EXPIRED",
  ]);
});

it("expires an approval that arrives after its 60 seconds, moving no money", async () => {
  const { biometricKeyId } = await pairTestPhone();
  const started = await startTestTransfer(2_550);
  const balanceBefore = await balanceMinor();
  jest.spyOn(Date, "now").mockReturnValue(Date.now() + 60_000);

  const late = await sendToBank<BankErrorBody>("POST", started.approvalPath, {
    body: signTestApproval(started, {
      kind: "biometric",
      keyId: biometricKeyId,
    }),
  });
  const { body } = await sendToBank<GetTransferResponse>(
    "GET",
    `/transfers/${started.created.transfer.transferId}`,
  );

  expect([late.status, errorCodeOf(late)]).toEqual([410, "APPROVAL_EXPIRED"]);
  expect(body.transfer).toMatchObject({
    status: TransferStatus.Expired,
    funds: TransferFunds.NotDebited,
    version: 2,
  });
  expect(await balanceMinor()).toBe(balanceBefore);
});

it("refuses a signature over other details, and a key it never registered", async () => {
  const { biometricKeyId } = await pairTestPhone();
  const started = await startTestTransfer(2_550);

  const tampered = await sendToBank<BankErrorBody>(
    "POST",
    started.approvalPath,
    {
      body: signTestApproval(
        started,
        { kind: "biometric", keyId: biometricKeyId },
        25_500,
      ),
    },
  );
  const unknownKey = await sendToBank<BankErrorBody>(
    "POST",
    started.approvalPath,
    {
      body: signTestApproval(started, {
        kind: "biometric",
        keyId: "key_unknown",
      }),
    },
  );

  expect([tampered.status, errorCodeOf(tampered)]).toEqual([
    403,
    "APPROVAL_INVALID",
  ]);
  expect([unknownKey.status, errorCodeOf(unknownKey)]).toEqual([
    409,
    "KEY_NOT_REGISTERED",
  ]);
});

it("re-checks today's limit at approval and ends a short transfer unsuccessful, undebited", async () => {
  const { biometricKeyId } = await pairTestPhone();
  const balanceBefore = await balanceMinor();
  const first = await startTestTransfer(300_000);
  const second = await startTestTransfer(300_000);
  const key = { kind: "biometric" as const, keyId: biometricKeyId };

  await sendToBank("POST", first.approvalPath, {
    body: signTestApproval(first, key),
  });
  const short = await sendToBank<ApproveTransferResponse>(
    "POST",
    second.approvalPath,
    { body: signTestApproval(second, key) },
  );

  expect(short.body.transfer).toMatchObject({
    status: TransferStatus.Unsuccessful,
    funds: TransferFunds.NotDebited,
    failureReason: TransferFailureReason.DailyLimitExceeded,
  });
  expect(await balanceMinor()).toBe(balanceBefore - 300_000);
});

it("keeps a transfer approvable when minting its reference fails", async () => {
  const { biometricKeyId } = await pairTestPhone();
  const started = await startTestTransfer(2_550);
  const approval = signTestApproval(started, {
    kind: "biometric",
    keyId: biometricKeyId,
  });
  const workingPorts = bankPorts();
  bindBankPorts({
    ...workingPorts,
    randomBytes: () => {
      throw new Error("No randomness on this phone");
    },
  });

  const failed = await sendToBank("POST", started.approvalPath, {
    body: approval,
  });
  bindBankPorts(workingPorts);
  const retried = await sendToBank<ApproveTransferResponse>(
    "POST",
    started.approvalPath,
    { body: approval },
  );

  expect(failed.status).toBe(500);
  expect(retried.body.transfer.status).toBe(TransferStatus.Completed);
});

it("approves with the possession key only beside the right PIN, and a resent wrong PIN costs one try", async () => {
  const { possessionKeyId } = await pairTestPhone();
  const started = await startTestTransfer(2_550);
  const approval = signTestApproval(started, {
    kind: "possession",
    keyId: possessionKeyId,
  });

  const withoutPin = await sendToBank<BankErrorBody>(
    "POST",
    started.approvalPath,
    { body: approval },
  );
  const wrong = await sendToBank<BankErrorBody>("POST", started.approvalPath, {
    body: { ...approval, pin: "135790" },
    idempotencyKey: "wrong-pin",
  });
  const wrongResent = await sendToBank<BankErrorBody>(
    "POST",
    started.approvalPath,
    { body: { ...approval, pin: "135790" }, idempotencyKey: "wrong-pin" },
  );
  const right = await sendToBank<ApproveTransferResponse>(
    "POST",
    started.approvalPath,
    { body: { ...approval, pin: DEMO_PIN } },
  );

  expect([withoutPin.status, errorCodeOf(withoutPin)]).toEqual([
    400,
    "INVALID_REQUEST",
  ]);
  expect(wrong.status).toBe(422);
  expect(wrong.body.error).toMatchObject({
    code: "PIN_INCORRECT",
    attemptsRemaining: 2,
  });
  expect(wrongResent).toEqual(wrong);
  expect(right.body.transfer.status).toBe(TransferStatus.Completed);
});

it("locks the PIN on the third wrong try, refusing even the right one until unlocked", async () => {
  const { possessionKeyId } = await pairTestPhone();
  const started = await startTestTransfer(2_550);
  const approval = signTestApproval(started, {
    kind: "possession",
    keyId: possessionKeyId,
  });
  const tryPin = (pin: string) =>
    sendToBank<BankErrorBody & ApproveTransferResponse>(
      "POST",
      started.approvalPath,
      { body: { ...approval, pin } },
    );

  const tries = [await tryPin("111111"), await tryPin("222222")];
  const third = await tryPin("333333");
  const rightWhileLocked = await tryPin(DEMO_PIN);
  unlockDemoPin();
  const rightAfterUnlock = await tryPin(DEMO_PIN);

  expect(tries.map(({ body }) => body.error.attemptsRemaining)).toEqual([2, 1]);
  expect([third.status, errorCodeOf(third)]).toEqual([423, "PIN_LOCKED"]);
  expect([rightWhileLocked.status, errorCodeOf(rightWhileLocked)]).toEqual([
    423,
    "PIN_LOCKED",
  ]);
  expect(rightAfterUnlock.body.transfer.status).toBe(TransferStatus.Completed);
});

it("asks for the PIN before replacing keys on file, then tells the customer", async () => {
  const paired = await pairTestPhone();
  const biometricKey = { biometricPublicKey: phonePublicKeySpki("biometric") };

  const withoutPin = await sendToBank<BankErrorBody>("POST", "/approval-keys", {
    body: biometricKey,
  });
  const replaced = await sendToBank<RegisterApprovalKeysResponse>(
    "POST",
    "/approval-keys",
    { body: { ...biometricKey, pin: DEMO_PIN } },
  );
  const started = await startTestTransfer(2_550);
  const withOldKey = await sendToBank<BankErrorBody>(
    "POST",
    started.approvalPath,
    {
      body: signTestApproval(started, {
        kind: "biometric",
        keyId: paired.biometricKeyId,
      }),
    },
  );

  expect([withoutPin.status, errorCodeOf(withoutPin)]).toEqual([
    403,
    "PIN_REQUIRED",
  ]);
  expect(replaced.status).toBe(200);
  expect(Object.keys(replaced.body)).toEqual(["biometricKeyId"]);
  expect(errorCodeOf(withOldKey)).toBe("KEY_NOT_REGISTERED");
  expect(demoBankNotifications()).toEqual([
    expect.objectContaining({
      message: expect.stringContaining("approve transfers changed") as string,
    }),
  ]);
});

it("answers a repeated create with the first transfer rather than a second", async () => {
  const lookup = await lookUpTestRecipient();
  const body = {
    recipientRef: lookup.recipientRef,
    amount: { minor: 1_000, currency: "MYR" },
  };

  const first = await sendToBank<CreateTransferResponse>("POST", "/transfers", {
    body,
    idempotencyKey: "create-once",
  });
  const repeat = await sendToBank<CreateTransferResponse>(
    "POST",
    "/transfers",
    {
      body,
      idempotencyKey: "create-once",
    },
  );

  expect(repeat).toEqual(first);
});
