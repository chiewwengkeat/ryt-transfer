import { Stack } from "expo-router";
import { useEffect } from "react";

import {
  dispatchTransferFlow,
  isTransferDraftOpen,
  TransferFlowActionType,
  TransferFlowStep,
  useTransferFlow,
} from "@/screens/transfer/flow-store/flow-store";
import { screenTransitionOptions } from "@/shared/lib/motion/motion";
import { demoLayer } from "@/shell/app-launch";

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
    <Stack
      // Android's header pads for the status bar itself, a place the Demo header has already taken.
      screenOptions={
        demoLayer === null
          ? screenTransitionOptions
          : () => ({
              ...screenTransitionOptions(),
              unstable_nativeProps: {
                headerConfig: { disableTopInsetApplication: true },
              },
            })
      }
    >
      <Stack.Protected guard={draftStepsOpen}>
        <Stack.Screen name="amount" />
        <Stack.Screen name="review" />
      </Stack.Protected>
    </Stack>
  );
}

export const unstable_settings = { anchor: "index" };

export { default as ErrorBoundary } from "@/shared/ui/ViewScreenError/ViewScreenError";
