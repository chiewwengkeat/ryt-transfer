import type { ApproveTransferResponse } from "@/domains/transfer/api/approve-transfer/approve-transfer.type";
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
  pairTestPhone,
  readBankBalanceMinor,
  readBankUsedTodayMinor,
  sendToBank,
  signTestApproval,
  startTestTransfer,
  type BankErrorBody,
} from "@/test/bank-client";

afterEach(() => {
  jest.restoreAllMocks();
});

it("debits once when the approval verifies, however many approvals arrive", async () => {
  const { biometricKeyId } = await pairTestPhone();
  const balanceBefore = await readBankBalanceMinor();
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
  expect(await readBankBalanceMinor()).toBe(balanceBefore - 2_550);
  expect(await readBankUsedTodayMinor()).toBe(2_550);
  expect(demoBankNotifications()).toEqual([
    expect.objectContaining({
      message: expect.stringContaining("You sent 25.50 MYR") as string,
    }),
  ]);
});

it("expires an approval that arrives after its 60 seconds, moving no money", async () => {
  const { biometricKeyId } = await pairTestPhone();
  const started = await startTestTransfer(2_550);
  const balanceBefore = await readBankBalanceMinor();
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

  expect([late.status, late.body.error.code]).toEqual([
    410,
    "APPROVAL_EXPIRED",
  ]);
  expect(body.transfer).toMatchObject({
    status: TransferStatus.Expired,
    funds: TransferFunds.NotDebited,
    version: 2,
  });
  expect(await readBankBalanceMinor()).toBe(balanceBefore);
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

  expect([tampered.status, tampered.body.error.code]).toEqual([
    403,
    "APPROVAL_INVALID",
  ]);
  expect([unknownKey.status, unknownKey.body.error.code]).toEqual([
    409,
    "KEY_NOT_REGISTERED",
  ]);
});

it("re-checks today's limit at approval and ends a short transfer unsuccessful, undebited", async () => {
  const { biometricKeyId } = await pairTestPhone();
  const balanceBefore = await readBankBalanceMinor();
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
  expect(await readBankBalanceMinor()).toBe(balanceBefore - 300_000);
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

  expect([withoutPin.status, withoutPin.body.error.code]).toEqual([
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
  expect([third.status, third.body.error.code]).toEqual([423, "PIN_LOCKED"]);
  expect([rightWhileLocked.status, rightWhileLocked.body.error.code]).toEqual([
    423,
    "PIN_LOCKED",
  ]);
  expect(rightAfterUnlock.body.transfer.status).toBe(TransferStatus.Completed);
});
