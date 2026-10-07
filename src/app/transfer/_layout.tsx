import { Stack } from "expo-router";
import { useEffect } from "react";

import {
  dispatchTransferFlow,
  isTransferDraftOpen,
  TransferFlowActionType,
  useTransferFlow,
} from "@/screens/transfer/state/transfer-flow";

export default function TransferLayout() {
  const draftOpen = useTransferFlow(isTransferDraftOpen);
  // Leaving the flow abandons its draft, so a draft nobody returns to never blocks a link.
  useEffect(
    () => () => {
      dispatchTransferFlow({ type: TransferFlowActionType.FlowLeft });
    },
    [],
  );

  return (
    <Stack>
      <Stack.Protected guard={draftOpen}>
        <Stack.Screen name="amount" />
      </Stack.Protected>
    </Stack>
  );
}

export const unstable_settings = { anchor: "index" };

export { default as ErrorBoundary } from "@/shared/ui/ViewScreenError/ViewScreenError";
