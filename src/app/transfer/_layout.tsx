import { Stack } from "expo-router";
import { useEffect } from "react";

import {
  dispatchTransferFlow,
  TransferFlowActionType,
} from "@/screens/transfer/state/transfer-flow";

export default function TransferLayout() {
  // Leaving the flow abandons its draft, so a draft nobody returns to never blocks a link.
  useEffect(
    () => () => {
      dispatchTransferFlow({ type: TransferFlowActionType.FlowLeft });
    },
    [],
  );

  return <Stack />;
}

export const unstable_settings = { anchor: "index" };

export { default as ErrorBoundary } from "@/shared/ui/ViewScreenError/ViewScreenError";
