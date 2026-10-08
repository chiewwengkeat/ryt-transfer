import { createStore } from "zustand/vanilla";

// The host app's "Enable Biometrics" setting, on until the customer turns it off there.
export const approvalSettingsStore = createStore(() => ({
  biometricApprovalOn: true,
}));
