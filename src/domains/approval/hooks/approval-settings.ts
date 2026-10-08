import { createStore } from "zustand/vanilla";

import { forgetApprovalPinLock } from "./approval-pin-lock";

// The host app's "Enable Biometrics" setting, on until the customer turns it off there.
export const approvalSettingsStore = createStore(() => ({
  biometricApprovalOn: true,
}));

// The host app calls this once the customer's PIN reset completes; until then the PIN path stays locked.
export function notifyApprovalPinReset() {
  return forgetApprovalPinLock();
}
