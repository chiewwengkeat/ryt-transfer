import { randomUUID } from "expo-crypto";

import { registerApprovalKeys } from "@/domains/approval/api/register-approval-keys/register-approval-keys";
import {
  hasApprovalKeysOnFile,
  createApprovalKeys,
  saveApprovalKeyIds,
} from "@/domains/approval/hooks/approval-keys";
import type { DemoLayer } from "@/shared/demo-layer/demo-layer.type";

import { handlersForActiveScenario } from "./demo-bank";
import { subscribeToBiometricsOff } from "./switcher/biometrics-off";
import ViewDemo from "./switcher/components/ViewDemo/ViewDemo";
import { subscribeToPhoneSidePick } from "./switcher/phone-side-picks";
import { switcherStore } from "./switcher/switcher-store";
import { createDemoSend } from "./transport/demo-send";

export default {
  demoSend: createDemoSend(handlersForActiveScenario),
  ViewDemo,
  subscribeToBiometricsOff,
  subscribeToScenarioChange: (onChange) => switcherStore.subscribe(onChange),
  subscribeToScreenCaptureBlock: (onChange) =>
    subscribeToPhoneSidePick("transfer.screen_capture_blocked", onChange),
  subscribeToRootedPhone: (onChange) =>
    subscribeToPhoneSidePick("transfer.rooted_phone", onChange),
  // Stands in for the pairing a host app made long ago, so the bank holds no cooling-off against it.
  async pairPhoneAtFirstLaunch() {
    if (await hasApprovalKeysOnFile()) return;
    const { possessionKeyId, biometricKeyId } = await registerApprovalKeys(
      await createApprovalKeys(),
      randomUUID(),
    );
    if (possessionKeyId === undefined || biometricKeyId === undefined)
      throw new Error("The bank registered only some of the approval keys.");
    await saveApprovalKeyIds({ possessionKeyId, biometricKeyId });
  },
} satisfies DemoLayer;
