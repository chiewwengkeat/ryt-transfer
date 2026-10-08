import { randomUUID } from "expo-crypto";

import { registerApprovalKeys } from "@/domains/approval/api/register-approval-keys/register-approval-keys";
import {
  approvalKeysOnFile,
  createApprovalKeys,
  saveApprovalKeyIds,
} from "@/domains/approval/hooks/approval-keys";
import type { DemoLayer } from "@/shared/demo-layer/demo-layer.type";

import { handlersForActiveScenario } from "./demo-bank";
import { subscribeToBiometricsOff } from "./switcher/biometrics-off";
import OverlayDemo from "./switcher/components/OverlayDemo/OverlayDemo";
import { switcherStore } from "./switcher/switcher-store";
import { createDemoSend } from "./transport/demo-send";

export default {
  demoSend: createDemoSend(handlersForActiveScenario),
  OverlayDemo,
  subscribeToBiometricsOff,
  subscribeToScenarioChange: (onChange) => switcherStore.subscribe(onChange),
  // Stands in for the pairing a host app made long ago, so the bank holds no cooling-off against it.
  async pairPhoneAtFirstLaunch() {
    if (await approvalKeysOnFile()) return;
    const { possessionKeyId, biometricKeyId } = await registerApprovalKeys(
      await createApprovalKeys(),
      randomUUID(),
    );
    if (possessionKeyId === undefined || biometricKeyId === undefined)
      throw new Error("The bank registered only some of the approval keys.");
    await saveApprovalKeyIds({ possessionKeyId, biometricKeyId });
  },
} satisfies DemoLayer;
