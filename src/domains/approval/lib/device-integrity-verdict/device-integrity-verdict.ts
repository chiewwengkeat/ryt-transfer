import { isProductionBuild } from "@/shared/config/config";
import { trackEvent } from "@/shared/observability/observability/observability";
import {
  checkDeviceIntegrity,
  DeviceIntegrity,
} from "@/shared/platform/device-integrity/device-integrity";
import { createStore } from "zustand/vanilla";

export const rootedPhoneDemoPickStore = createStore(() => ({
  rootedPhonePicked: false,
}));

// Once at launch, so the check an approval waits on is never the library's first.
export function warmUpDeviceIntegrityCheck() {
  if (isProductionBuild) void checkDeviceIntegrity();
}

export async function isApprovalRefusedOnThisPhone() {
  if (!isProductionBuild)
    return rootedPhoneDemoPickStore.getState().rootedPhonePicked;
  const integrity = await checkDeviceIntegrity();
  // Allowed: an unclear check must not lock out a genuine customer.
  if (integrity === DeviceIntegrity.Unknown)
    trackEvent("device_integrity_unknown");
  return integrity === DeviceIntegrity.Compromised;
}
