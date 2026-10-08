import type { ComponentType, ReactNode } from "react";

import type { Send } from "@/shared/http/transport";

// Declared outside src/mocks: the shell may not import even a type from there.
export interface DemoLayer {
  demoSend: Send;
  pairPhoneAtFirstLaunch: () => Promise<void>;
  ViewDemo: ComponentType<{
    children: ReactNode;
    onResetDemo: () => Promise<void>;
    onSheetOpenChange: (sheetOpen: boolean) => void;
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
