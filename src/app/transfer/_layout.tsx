import { flowStackScreenOptions } from "@/root/app-launch/app-launch";
import {
  dispatchTransferFlow,
  isTransferDraftOpen,
  TransferFlowActionType,
  TransferFlowStep,
  useTransferFlow,
} from "@/screens/transfer/flow-store/flow-store";
import { Stack } from "expo-router";
import { useEffect } from "react";

export default function TransferLayout() {
  // Open through Done: the result page replaces this stack a commit later, and closing first shows the recipient step.
  const draftStepsOpen = useTransferFlow(
    (flow) => isTransferDraftOpen(flow) || flow.step === TransferFlowStep.Done,
  );
  // Leaving the flow abandons its draft, so a draft nobody returns to never blocks a link.
  useEffect(
    () => () => {
      dispatchTransferFlow({ type: TransferFlowActionType.FlowLeft });
    },
    [],
  );

  return (
    <Stack screenOptions={flowStackScreenOptions}>
      <Stack.Protected guard={draftStepsOpen}>
        <Stack.Screen name="amount" />
        <Stack.Screen name="review" />
      </Stack.Protected>
    </Stack>
  );
}

export const unstable_settings = { anchor: "index" };

export { default as ErrorBoundary } from "@/shared/ui/ViewScreenError/ViewScreenError";
