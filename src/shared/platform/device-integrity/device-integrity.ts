import { getDeviceIntegrityStatus } from "@sbaiahmed1/react-native-biometrics";

export enum DeviceIntegrity {
  Compromised = "compromised",
  Clear = "clear",
  Unknown = "unknown",
}

export async function checkDeviceIntegrity() {
  let unansweredTimer: ReturnType<typeof setTimeout> | undefined;
  const report = await Promise.race([
    getDeviceIntegrityStatus().catch(() => null),
    new Promise<null>((resolve) => {
      unansweredTimer = setTimeout(() => {
        resolve(null);
      }, INTEGRITY_CHECK_TIMEOUT_MS);
    }),
  ]);
  clearTimeout(unansweredTimer);
  if (report === null) return DeviceIntegrity.Unknown;
  // Never isCompromised: on Android it also counts a phone with no screen lock, or a failed check, as compromised.
  if (
    [report.isRooted, report.isJailbroken, report.hasRuntimeHooks].includes(
      true,
    )
  )
    return DeviceIntegrity.Compromised;
  if (report.error !== undefined || report.riskLevel === "UNKNOWN")
    return DeviceIntegrity.Unknown;
  return DeviceIntegrity.Clear;
}

// No answer within this reads as unclear, as a failed check does: a check that never settles must not hold an approval.
const INTEGRITY_CHECK_TIMEOUT_MS = 5_000;
