import {
  BiometricStrength,
  createKeysWithOptions,
  deleteKeys,
  InputEncoding,
  isSensorAvailable,
  sign,
  signWithOptions,
} from "@sbaiahmed1/react-native-biometrics";
import { Platform } from "react-native";

import type { RegisterApprovalKeysResponse } from "@/domains/approval/api/register-approval-keys/register-approval-keys.type";
import { trackEvent } from "@/shared/observability/observability";
import {
  readSecureRecord,
  writeSecureRecord,
} from "@/shared/platform/secure-storage";

export enum BiometricSignOutcome {
  Signed = "signed",
  Cancelled = "cancelled",
  NotRecognised = "not_recognised",
  LockedOut = "locked_out",
  NotSetUp = "not_set_up",
  NoSensor = "no_sensor",
  KeyChanged = "key_changed",
  Failed = "failed",
}

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

export async function saveApprovalKeyIds(
  keyIds: Required<RegisterApprovalKeysResponse>,
) {
  await writeSecureRecord(POSSESSION_KEY_ID_RECORD, keyIds.possessionKeyId);
  await writeSecureRecord(BIOMETRIC_KEY_ID_RECORD, keyIds.biometricKeyId);
}

export async function signWithBiometricKey(
  signedText: string,
  prompt: { title: string; subtitle: string; cancel: string },
) {
  const keyId = await readSecureRecord(BIOMETRIC_KEY_ID_RECORD);
  if (keyId === null) return { outcome: BiometricSignOutcome.Failed } as const;
  // Asked first: on a phone, iOS signing reports neither a lockout nor an empty enrolment.
  const sensor = await isSensorAvailable({
    biometricStrength: BiometricStrength.Strong,
  }).catch(() => undefined);
  const sensorRefusal =
    sensor?.available === false
      ? SIGN_OUTCOME_BY_LIBRARY_CODE.get(sensor.errorCode ?? "")
      : undefined;
  if (sensorRefusal !== undefined) {
    trackEvent("biometric_signing", {
      outcome: sensorRefusal,
      errorCode: sensor?.errorCode,
    });
    return { outcome: sensorRefusal };
  }

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
  }).catch(() => undefined);
  if (result?.success && result.signature !== undefined) {
    trackEvent("biometric_signing", { outcome: BiometricSignOutcome.Signed });
    return {
      outcome: BiometricSignOutcome.Signed,
      keyId,
      signature: result.signature,
    } as const;
  }
  const outcome =
    SIGN_OUTCOME_BY_LIBRARY_CODE.get(result?.errorCode ?? "") ??
    BiometricSignOutcome.Failed;
  trackEvent("biometric_signing", { outcome, errorCode: result?.errorCode });
  return { outcome };
}

// No prompt: the PIN that travels beside this signature is what the bank checks.
export async function signWithPossessionKey(signedText: string) {
  const keyId = await readSecureRecord(POSSESSION_KEY_ID_RECORD);
  if (keyId === null) return null;
  try {
    const result = await sign({
      keyAlias: POSSESSION_KEY_ALIAS,
      data: signedText,
      inputEncoding: InputEncoding.UTF8,
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

// Both platforms' spellings: the library names one result differently on each.
const SIGN_OUTCOME_BY_LIBRARY_CODE = new Map<
  string,
  Exclude<BiometricSignOutcome, BiometricSignOutcome.Signed>
>([
  ["USER_CANCELED", BiometricSignOutcome.Cancelled],
  ["USER_CANCEL", BiometricSignOutcome.Cancelled],
  ["SYSTEM_CANCELED", BiometricSignOutcome.Cancelled],
  ["SYSTEM_CANCEL", BiometricSignOutcome.Cancelled],
  ["USER_FALLBACK", BiometricSignOutcome.Cancelled],
  ["BIOMETRIC_TIMEOUT", BiometricSignOutcome.Cancelled],
  ["AUTHENTICATION_FAILED", BiometricSignOutcome.NotRecognised],
  ["BIOMETRIC_LOCKOUT", BiometricSignOutcome.LockedOut],
  ["BIOMETRIC_LOCKOUT_PERMANENT", BiometricSignOutcome.LockedOut],
  ["BIOMETRY_LOCKOUT", BiometricSignOutcome.LockedOut],
  ["NO_BIOMETRICS_ENROLLED", BiometricSignOutcome.NotSetUp],
  ["BIOMETRY_NOT_ENROLLED", BiometricSignOutcome.NotSetUp],
  ["BiometricErrorNoneEnrolled", BiometricSignOutcome.NotSetUp],
  ["BIOMETRIC_NOT_AVAILABLE", BiometricSignOutcome.NoSensor],
  ["BIOMETRIC_UNAVAILABLE", BiometricSignOutcome.NoSensor],
  ["NO_BIOMETRIC_HARDWARE", BiometricSignOutcome.NoSensor],
  ["BIOMETRY_NOT_AVAILABLE", BiometricSignOutcome.NoSensor],
  ["PASSCODE_NOT_SET", BiometricSignOutcome.NoSensor],
  ["BiometricErrorNoHardware", BiometricSignOutcome.NoSensor],
  ["BiometricErrorHwUnavailable", BiometricSignOutcome.NoSensor],
  ["BiometricErrorUnsupported", BiometricSignOutcome.NoSensor],
  ["BiometricErrorSecurityUpdateRequired", BiometricSignOutcome.NoSensor],
  ["BIOMETRY_CURRENT_SET_CHANGED", BiometricSignOutcome.KeyChanged],
  // Gone while its id is still on file: the phone dropped it when the face or fingerprints changed.
  ["KEY_NOT_FOUND", BiometricSignOutcome.KeyChanged],
  // Android names a key killed by a new enrolment only this way; on iOS it is the catch-all, a cancel among them.
  [
    "SIGNATURE_CREATION_FAILED",
    Platform.OS === "android"
      ? BiometricSignOutcome.KeyChanged
      : BiometricSignOutcome.Failed,
  ],
]);
