import type { ComponentType } from "react";

import type { Send } from "@/shared/http/transport";

// Declared outside src/mocks: the shell may not import even a type from there.
export interface DemoLayer {
  demoSend: Send;
  pairPhoneAtFirstLaunch: () => Promise<void>;
  OverlayDemo: ComponentType<{
    onResetDemo: () => Promise<void>;
    onSheetOpenChange: (sheetOpen: boolean) => void;
  }>;
  subscribeToBiometricsOff: (
    onChange: (biometricsOff: boolean) => void,
  ) => () => void;
}
