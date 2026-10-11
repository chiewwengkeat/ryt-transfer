import { writeSecureRecord } from "@/shared/platform/secure-storage/secure-storage";
import {
  BiometricSignOutcome,
  createApprovalKeys,
  saveApprovalKeyIds,
  signWithBiometricKey,
} from "./approval-keys";

it("signs with the first set's biometric key while only the possession key has a set on file", async () => {
  await createApprovalKeys({ possession: "second", biometric: "first" });
  await saveApprovalKeyIds({ possessionKeyId: "pk_1", biometricKeyId: "bk_1" });
  await writeSecureRecord({ namespace: "approval", name: "key-set" }, "second");

  const signing = await signWithBiometricKey("Approve RM 10.00", {
    title: "Approve the transfer",
    subtitle: "RM 10.00",
    cancel: "Cancel",
  });

  expect(signing).toMatchObject({
    outcome: BiometricSignOutcome.Signed,
    keyId: "bk_1",
  });
});
