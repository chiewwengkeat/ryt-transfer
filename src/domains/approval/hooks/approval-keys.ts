import {
  BiometricStrength,
  createKeysWithOptions,
  deleteKeys,
  InputEncoding,
  signWithOptions,
} from "@sbaiahmed1/react-native-biometrics";

import {
  readSecureRecord,
  writeSecureRecord,
} from "@/shared/platform/secure-storage";

const POSSESSION_KEY_ALIAS = "ryt-transfer.approval.possession";
const BIOMETRIC_KEY_ALIAS = "ryt-transfer.approval.biometric";
const POSSESSION_KEY_ID_RECORD = {
  namespace: "approval",
  name: "possession-key-id",
};
const BIOMETRIC_KEY_ID_RECORD = {
  namespace: "approval",
  name: "biometric-key-id",
};

export async function approvalKeysOnFile() {
  const keyIds = await Promise.all([
    readSecureRecord(POSSESSION_KEY_ID_RECORD),
    readSecureRecord(BIOMETRIC_KEY_ID_RECORD),
  ]);
  return keyIds.every((keyId) => keyId !== null);
}

export async function createApprovalKeys() {
  const possessionKey = await createKeysWithOptions({
    keyAlias: POSSESSION_KEY_ALIAS,
    keyType: "ec256",
    requireAuthentication: false,
  });
  // ⛔ Never allow device credentials: the phone's passcode must never approve a transfer.
  const biometricKey = await createKeysWithOptions({
    keyAlias: BIOMETRIC_KEY_ALIAS,
    keyType: "ec256",
    biometricStrength: BiometricStrength.Strong,
    allowDeviceCredentials: false,
  });
  return {
    possessionPublicKey: possessionKey.publicKey,
    biometricPublicKey: biometricKey.publicKey,
  };
}

export async function saveApprovalKeyIds(keyIds: {
  possessionKeyId: string;
  biometricKeyId: string;
}) {
  await writeSecureRecord(POSSESSION_KEY_ID_RECORD, keyIds.possessionKeyId);
  await writeSecureRecord(BIOMETRIC_KEY_ID_RECORD, keyIds.biometricKeyId);
}

// Resolves null when nothing was signed: cancelled, not recognised, or no usable biometrics.
export async function signWithBiometricKey(
  signedText: string,
  prompt: { title: string; subtitle: string; cancel: string },
) {
  const keyId = await readSecureRecord(BIOMETRIC_KEY_ID_RECORD);
  if (keyId === null) return null;
  try {
    const result = await signWithOptions({
      keyAlias: BIOMETRIC_KEY_ALIAS,
      data: signedText,
      inputEncoding: InputEncoding.UTF8,
      promptTitle: prompt.title,
      // Android only: on iOS the library hands Face ID the title alone.
      promptSubtitle: prompt.subtitle,
      cancelButtonText: prompt.cancel,
      biometricStrength: BiometricStrength.Strong,
      disableDeviceFallback: true,
    });
    return result.success && result.signature !== undefined
      ? { keyId, signature: result.signature }
      : null;
  } catch {
    return null;
  }
}

export async function deleteApprovalKeys() {
  await deleteKeys(POSSESSION_KEY_ALIAS);
  await deleteKeys(BIOMETRIC_KEY_ALIAS);
}
