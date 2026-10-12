/* eslint-disable fe/file-layout -- its launch steps run in order */
import { deleteApprovalKeys } from "@/domains/approval/lib/approval-keys/approval-keys";
import { warmUpDeviceIntegrityCheck } from "@/domains/approval/lib/device-integrity-verdict/device-integrity-verdict";
import type { DemoLayer } from "@/mocks/demo-layer/demo-layer";
import {
  TransferFlowStep,
  transferFlowStore,
} from "@/screens/transfer/flow-store/flow-store";
import { isProductionBuild } from "@/shared/config/config";
import { configureTransport } from "@/shared/http/transport/transport";
import { screenTransitionOptions } from "@/shared/lib/motion/motion";
import { reportError } from "@/shared/observability/observability/observability";
import { enableAppSwitcherBlur } from "@/shared/platform/app-switcher-blur/app-switcher-blur";
import { kvStorage } from "@/shared/platform/kv-storage/kv-storage";
import { blockScreenCapture } from "@/shared/platform/screen-capture/screen-capture";
import { deleteAllSecureRecords } from "@/shared/platform/secure-storage/secure-storage";
import ButtonHeaderBack from "@/shared/ui/ButtonHeaderBack/ButtonHeaderBack";
import { createElement } from "react";
import type { ColorValue } from "react-native";

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

// At load, ahead of the root view's guard, so the block is in place before anything renders.
if (isProductionBuild) blockScreenCapture();
enableAppSwitcherBlur();
warmUpDeviceIntegrityCheck();

// Compared literally, never through the config predicate: Metro strips the demo layer from production only for this form.
export const demoLayer =
  process.env.EXPO_PUBLIC_APP_VARIANT === "demo" ||
  process.env.EXPO_PUBLIC_APP_VARIANT === "development"
    ? (require("@/mocks/demo-layer/demo-layer") as { default: DemoLayer })
        .default
    : null;

if (demoLayer !== null) {
  // At module scope, never in an effect: a screen's effects run before the root view's, so its first request would miss it.
  configureTransport({ send: demoLayer.demoSend });
  demoLayer.watchAmountStepOpen(() => {
    const flow = transferFlowStore.getState();
    return (
      flow.step === TransferFlowStep.Editing &&
      flow.draft.recipient !== undefined
    );
  });
  // After the install check, whose wipe would delete keys paired while it ran.
  installChecked
    .then(demoLayer.pairPhoneAtFirstLaunch)
    .catch((error: unknown) => {
      reportError(error, { boundary: "demo_pairing" });
    });
}

// One back button for every screen: the platform's own sits elsewhere, and a flow's first screen has none.
function buildStackScreenOptions(doesFirstScreenOpenHome: boolean) {
  return ({
    route,
    navigation,
  }: {
    route: { key: string };
    navigation: { getState: () => { routes: readonly { key: string }[] } };
  }) => {
    const isFirstInStack = navigation.getState().routes[0]?.key === route.key;
    const doesOpenHome = doesFirstScreenOpenHome && isFirstInStack;
    return {
      ...screenTransitionOptions(),
      // None at all where there is no way back: iOS draws an empty button round a header-left that renders nothing.
      ...((doesOpenHome || !isFirstInStack) && {
        headerLeft: ({
          tintColor,
          canGoBack,
        }: {
          tintColor?: ColorValue;
          canGoBack?: boolean;
        }) =>
          createElement(ButtonHeaderBack, {
            tintColor,
            canGoBack,
            opensHome: doesOpenHome,
          }),
      }),
      // Android's header pads for the status bar itself, a place the Demo header has already taken.
      ...(demoLayer !== null && {
        unstable_nativeProps: {
          headerConfig: { disableTopInsetApplication: true },
        },
      }),
    };
  };
}

export const stackScreenOptions = buildStackScreenOptions(false);
export const flowStackScreenOptions = buildStackScreenOptions(true);
