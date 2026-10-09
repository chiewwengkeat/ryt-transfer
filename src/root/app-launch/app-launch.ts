import { deleteApprovalKeys } from "@/domains/approval/hooks/approval-keys";
import type { DemoLayer } from "@/domains/approval/hooks/demo-layer.type";
import { warmUpDeviceIntegrityCheck } from "@/domains/approval/hooks/device-integrity-verdict";
import { isProductionBuild } from "@/shared/config/config";
import { configureTransport } from "@/shared/http/transport";
import { reportError } from "@/shared/observability/observability";
import { enableAppSwitcherBlur } from "@/shared/platform/app-switcher-blur";
import { kvStorage } from "@/shared/platform/kv-storage";
import { blockScreenCapture } from "@/shared/platform/screen-capture";
import { deleteAllSecureRecords } from "@/shared/platform/secure-storage";

const INSTALL_MARKER_KEY = "install-marker";

// The keychain keeps records and keys through an uninstall and this app's own storage does not, so no marker
// means a reinstall: nothing left from before it may approve or be resumed. Asked at load, ahead of any write.
const installChecked = (async () => {
  if (kvStorage.getItemSync(INSTALL_MARKER_KEY) !== null) return;
  await deleteAllSecureRecords();
  await deleteApprovalKeys();
  kvStorage.setItemSync(INSTALL_MARKER_KEY, new Date().toISOString());
})().catch((error: unknown) => {
  reportError(error, { boundary: "install_marker" });
});

// At load, ahead of the shell's guard, so the block is in place before anything renders.
if (isProductionBuild) void blockScreenCapture();
void enableAppSwitcherBlur();
warmUpDeviceIntegrityCheck();

// Compared literally, never through the config predicate: Metro strips the demo layer from production only for this form.
export const demoLayer =
  process.env.EXPO_PUBLIC_APP_VARIANT === "demo" ||
  process.env.EXPO_PUBLIC_APP_VARIANT === "development"
    ? (require("@/mocks/demo-layer") as { default: DemoLayer }).default
    : null;

if (demoLayer !== null) {
  // At module scope, never in an effect: a screen's effects run before the shell's, so its first request would miss it.
  configureTransport({ send: demoLayer.demoSend });
  // After the install check, whose wipe would delete keys paired while it ran.
  void installChecked
    .then(demoLayer.pairPhoneAtFirstLaunch)
    .catch((error: unknown) => {
      reportError(error, { boundary: "demo_pairing" });
    });
}
