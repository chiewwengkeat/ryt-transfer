import { randomUUID } from "expo-crypto";
import type { ComponentType, ReactNode } from "react";

import { registerApprovalKeys } from "@/domains/approval/api/register-approval-keys/register-approval-keys";
import {
  hasApprovalKeysOnFile,
  createApprovalKeys,
  saveApprovalKeyIds,
} from "@/domains/approval/hooks/approval-keys";
import { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import { handlersForActiveScenario } from "@/mocks/demo-bank";
import { subscribeToBiometricsOff } from "@/mocks/switcher/biometrics-off";
import ViewDemo from "@/mocks/switcher/components/ViewDemo/ViewDemo";
import { subscribeToPhoneSidePick } from "@/mocks/switcher/phone-side-picks";
import { switcherStore } from "@/mocks/switcher/switcher-store";
import { createDemoSend } from "@/mocks/transport/demo-send";
import type { Send } from "@/shared/http/transport";

export default {
  demoSend: createDemoSend(handlersForActiveScenario),
  ViewDemo,
  subscribeToBiometricsOff,
  subscribeToScenarioChange: (onChange) => switcherStore.subscribe(onChange),
  subscribeToScreenCaptureBlock: (onChange) =>
    subscribeToPhoneSidePick(TransferScenarioId.ScreenCaptureBlocked, onChange),
  subscribeToRootedPhone: (onChange) =>
    subscribeToPhoneSidePick(TransferScenarioId.RootedPhone, onChange),
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

export interface DemoLayer {
  demoSend: Send;
  pairPhoneAtFirstLaunch: () => Promise<void>;
  ViewDemo: ComponentType<{
    appSheetOpen: boolean;
    children: ReactNode;
    onResetDemo: () => Promise<void>;
  }>;
  subscribeToBiometricsOff: (
    onChange: (biometricsOff: boolean) => void,
  ) => () => void;
  subscribeToScenarioChange: (onChange: () => void) => () => void;
  subscribeToScreenCaptureBlock: (
    onChange: (captureBlocked: boolean) => void,
  ) => () => void;
  subscribeToRootedPhone: (
    onChange: (phoneRooted: boolean) => void,
  ) => () => void;
}
