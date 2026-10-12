import { registerApprovalKeys } from "@/domains/approval/api/register-approval-keys/register-approval-keys";
import type { RegisterApprovalKeysResponse } from "@/domains/approval/api/register-approval-keys/register-approval-keys.type";
import { trackEvent } from "@/shared/observability/observability/observability";
import {
  readSecureRecord,
  writeSecureRecord,
} from "@/shared/platform/secure-storage/secure-storage";
import {
  BiometricStrength,
  createKeysWithOptions,
  deleteKeys,
  InputEncoding,
  isSensorAvailable,
  sign,
  signWithOptions,
} from "@sbaiahmed1/react-native-biometrics";
import { randomUUID } from "expo-crypto";
import { Platform } from "react-native";

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

// Not both keys: a phone with nothing enrolled pairs without a biometric one, and pairing again remakes a key the bank holds.
export async function isPhonePaired() {
  return (await readSecureRecord(POSSESSION_KEY_ID_RECORD)) !== null;
}

export async function createApprovalKeys(keySets?: {
  possession: keyof typeof APPROVAL_KEY_SETS;
  biometric: keyof typeof APPROVAL_KEY_SETS;
}) {
  const possessionKey = await createKeysWithOptions({
    keyAlias:
      APPROVAL_KEY_SETS[
        keySets?.possession ?? (await readApprovalKeySetInUse("possession"))
      ].possession,
    keyType: "ec256",
    requireAuthentication: false,
  });
  // Android refuses this key while no strong biometric is enrolled, and the phone then pairs for the PIN alone.
  const biometricKey = await createKeysWithOptions({
    ...BIOMETRIC_KEY_OPTIONS,
    keyAlias:
      APPROVAL_KEY_SETS[
        keySets?.biometric ?? (await readApprovalKeySetInUse("biometric"))
      ].biometric,
  }).catch(() => undefined);
  return {
    possessionPublicKey: possessionKey.publicKey,
    biometricPublicKey: biometricKey?.publicKey,
  };
}

export async function createAndRegisterApprovalKeys(
  keySets?: Parameters<typeof createApprovalKeys>[0],
  pin?: string,
) {
  const keys = await createApprovalKeys(keySets);
  const { possessionKeyId, biometricKeyId } = await registerApprovalKeys(
    { ...keys, pin },
    randomUUID(),
  );
  if (
    possessionKeyId === undefined ||
    (keys.biometricPublicKey !== undefined && biometricKeyId === undefined)
  )
    throw new Error("The bank registered only some of the approval keys.");
  return { possessionKeyId, biometricKeyId };
}

export async function saveApprovalKeyIds(
  keyIds: RegisterApprovalKeysResponse & { possessionKeyId: string },
) {
  await writeSecureRecord(POSSESSION_KEY_ID_RECORD, keyIds.possessionKeyId);
  if (keyIds.biometricKeyId !== undefined)
    await writeSecureRecord(BIOMETRIC_KEY_ID_RECORD, keyIds.biometricKeyId);
}

export async function registerNewApprovalKeys(pin?: string) {
  const newKeySets = {
    possession: await readApprovalKeySetNotInUse("possession"),
    biometric: await readApprovalKeySetNotInUse("biometric"),
  } as const;
  const keyIds = await createAndRegisterApprovalKeys(newKeySets, pin);
  // Before the ids: stopped between the two, the phone sends ids the bank has dropped, which sets keys up again.
  await writeSecureRecord(
    APPROVAL_KEY_SET_RECORDS.possession,
    newKeySets.possession,
  );
  if (keyIds.biometricKeyId !== undefined)
    await writeSecureRecord(
      APPROVAL_KEY_SET_RECORDS.biometric,
      newKeySets.biometric,
    );
  await saveApprovalKeyIds(keyIds);
}

export async function replaceBiometricApprovalKey(pin: string) {
  const newKeySet = await readApprovalKeySetNotInUse("biometric");
  const { publicKey } = await createKeysWithOptions({
    ...BIOMETRIC_KEY_OPTIONS,
    keyAlias: APPROVAL_KEY_SETS[newKeySet].biometric,
  });
  const { biometricKeyId } = await registerApprovalKeys(
    { biometricPublicKey: publicKey, pin },
    randomUUID(),
  );
  if (biometricKeyId === undefined)
    throw new Error("The bank registered no biometric approval key.");
  // Before the id: stopped between the two, the phone sends an id the bank has dropped, which sets keys up again.
  await writeSecureRecord(APPROVAL_KEY_SET_RECORDS.biometric, newKeySet);
  await writeSecureRecord(BIOMETRIC_KEY_ID_RECORD, biometricKeyId);
}

export async function readBiometricSensorRefusal() {
  const sensor = await isSensorAvailable({
    biometricStrength: BiometricStrength.Strong,
  }).catch(() => undefined);
  // The library falls back to a weak face, which no biometric key accepts.
  if (sensor?.available && sensor.biometricStrength === BiometricStrength.Weak)
    return {
      outcome: BiometricSignOutcome.NoSensor,
      errorCode: "WEAK_BIOMETRICS_ONLY",
    } as const;
  const outcome =
    sensor?.available === false
      ? SIGN_OUTCOME_BY_LIBRARY_CODE.get(sensor.errorCode ?? "")
      : undefined;
  return outcome === undefined
    ? null
    : { outcome, errorCode: sensor?.errorCode };
}

export async function readBiometricRefusal() {
  const sensorRefusal = await readBiometricSensorRefusal();
  if (sensorRefusal !== null) return sensorRefusal;
  // A face or fingerprint enrolled after a pairing without one gets its key with the PIN, as a changed one does.
  return (await readSecureRecord(BIOMETRIC_KEY_ID_RECORD)) === null
    ? ({
        outcome: BiometricSignOutcome.KeyChanged,
        errorCode: "NO_BIOMETRIC_KEY",
      } as const)
    : null;
}

export async function signWithBiometricKey(
  signedText: string,
  prompt: { title: string; subtitle: string; cancel: string },
) {
  if (!(await isPhonePaired()))
    return { outcome: BiometricSignOutcome.Failed } as const;
  // Asked first: on a phone, iOS signing reports neither a lockout nor an empty enrolment.
  const refusal = await readBiometricRefusal();
  if (refusal !== null) {
    trackEvent("biometric_signing", refusal);
    return { outcome: refusal.outcome };
  }
  const keyId = await readSecureRecord(BIOMETRIC_KEY_ID_RECORD);
  if (keyId === null) return { outcome: BiometricSignOutcome.Failed } as const;

  const result = await signWithOptions({
    keyAlias:
      APPROVAL_KEY_SETS[await readApprovalKeySetInUse("biometric")].biometric,
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
      keyAlias:
        APPROVAL_KEY_SETS[await readApprovalKeySetInUse("possession")]
          .possession,
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
  for (const keyAliases of Object.values(APPROVAL_KEY_SETS)) {
    await deleteKeys(keyAliases.possession);
    await deleteKeys(keyAliases.biometric);
  }
}

// Each new key goes in the set its kind is not using, so keys the bank refuses never replace the ones it knows.
const APPROVAL_KEY_SETS = {
  // The aliases phones paired with before there were two sets.
  first: {
    possession: "ryt-transfer.approval.possession",
    biometric: "ryt-transfer.approval.biometric",
  },
  second: {
    possession: "ryt-transfer.approval.possession.second",
    biometric: "ryt-transfer.approval.biometric.second",
  },
};
const APPROVAL_KEY_SET_RECORDS = {
  possession: { namespace: "approval", name: "key-set" },
  biometric: { namespace: "approval", name: "biometric-key-set" },
};
const POSSESSION_KEY_ID_RECORD = {
  namespace: "approval",
  name: "possession-key-id",
};
const BIOMETRIC_KEY_ID_RECORD = {
  namespace: "approval",
  name: "biometric-key-id",
};
// ⛔ Never allow device credentials: the phone's passcode must never approve a transfer.
const BIOMETRIC_KEY_OPTIONS = {
  keyType: "ec256",
  biometricStrength: BiometricStrength.Strong,
  allowDeviceCredentials: false,
} as const;

async function readApprovalKeySetInUse(
  keyKind: keyof typeof APPROVAL_KEY_SET_RECORDS,
) {
  return (await readSecureRecord(APPROVAL_KEY_SET_RECORDS[keyKind])) ===
    "second"
    ? "second"
    : "first";
}

async function readApprovalKeySetNotInUse(
  keyKind: keyof typeof APPROVAL_KEY_SET_RECORDS,
) {
  return (await readApprovalKeySetInUse(keyKind)) === "first"
    ? "second"
    : "first";
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
  // After Android's own lockout recovery, the phone's PIN asked inside its prompt, the key refuses the match that follows.
  ["KEY_USER_NOT_AUTHENTICATED", BiometricSignOutcome.LockedOut],
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
