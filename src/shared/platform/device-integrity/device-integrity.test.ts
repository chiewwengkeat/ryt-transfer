import {
  failDeviceIntegrityChecks,
  reportDeviceIntegrity,
} from "@/test/doubles/biometrics-double";

import { checkDeviceIntegrity, DeviceIntegrity } from "./device-integrity";

it.each([
  [
    "a rooted Android phone",
    DeviceIntegrity.Compromised,
    { isRooted: true, isCompromised: true, riskLevel: "HIGH" },
  ],
  [
    "a jailbroken iPhone",
    DeviceIntegrity.Compromised,
    { isJailbroken: true, isCompromised: true, riskLevel: "HIGH" },
  ],
  [
    "a phone where something hooks into running apps",
    DeviceIntegrity.Compromised,
    { hasRuntimeHooks: true, isCompromised: true, riskLevel: "HIGH" },
  ],
  [
    "a rooted phone whose check also reports an error",
    DeviceIntegrity.Compromised,
    { isRooted: true, error: "Partial check", riskLevel: "UNKNOWN" },
  ],
  [
    "a phone with no screen lock, which the library calls compromised,",
    DeviceIntegrity.Clear,
    {
      isRooted: false,
      isKeyguardSecure: false,
      isCompromised: true,
      riskLevel: "MEDIUM",
    },
  ],
  [
    "a check that reports an error",
    DeviceIntegrity.Unknown,
    { error: "Check failed", isCompromised: true, riskLevel: "UNKNOWN" },
  ],
  [
    "a check whose risk level is unknown",
    DeviceIntegrity.Unknown,
    { riskLevel: "UNKNOWN" },
  ],
  ["an untampered phone", DeviceIntegrity.Clear, {}],
] as const)("reads %s as %s", async (_, integrity, report) => {
  reportDeviceIntegrity(report);

  await expect(checkDeviceIntegrity()).resolves.toBe(integrity);
});

it("reads a check that throws as unknown", async () => {
  failDeviceIntegrityChecks();

  await expect(checkDeviceIntegrity()).resolves.toBe(DeviceIntegrity.Unknown);
});
