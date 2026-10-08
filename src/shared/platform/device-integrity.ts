import { getDeviceIntegrityStatus } from "@sbaiahmed1/react-native-biometrics";

export enum DeviceIntegrity {
  Compromised = "compromised",
  Clear = "clear",
  Unknown = "unknown",
}

export async function checkDeviceIntegrity() {
  const report = await getDeviceIntegrityStatus().catch(() => null);
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
