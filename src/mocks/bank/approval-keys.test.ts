import type { RegisterApprovalKeysResponse } from "@/domains/approval/api/register-approval-keys/register-approval-keys.type";
import { DEMO_PIN } from "@/mocks/bank/seed";
import { demoBankNotifications } from "@/mocks/demo-bank";
import {
  pairTestPhone,
  phonePublicKeySpki,
  sendToBank,
  signTestApproval,
  startTestTransfer,
  type BankErrorBody,
} from "@/test/bank-client";

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

  expect([withoutPin.status, withoutPin.body.error.code]).toEqual([
    403,
    "PIN_REQUIRED",
  ]);
  expect(replaced.status).toBe(200);
  expect(Object.keys(replaced.body)).toEqual(["biometricKeyId"]);
  expect(withOldKey.body.error.code).toBe("KEY_NOT_REGISTERED");
  expect(demoBankNotifications()).toEqual([
    expect.objectContaining({
      message: expect.stringContaining("approve transfers changed") as string,
    }),
  ]);
});
