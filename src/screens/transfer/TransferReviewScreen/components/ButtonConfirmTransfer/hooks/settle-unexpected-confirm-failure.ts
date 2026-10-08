import type { QueryClient } from "@tanstack/react-query";

import {
  dispatchTransferFlow,
  TransferFlowActionType,
  TransferFlowScenario,
  TransferFlowStep,
  transferFlowStore,
} from "@/screens/transfer/state/transfer-flow";

import { settleApprovalAnswer } from "./settle-approval-answer";

export function settleUnexpectedConfirmFailure(queryClient: QueryClient) {
  // Before the approval leaves the phone nothing can have moved, so review offers it again.
  // After, nothing proves where it ended, so it settles as an answer that never came.
  const flow = transferFlowStore.getState();
  if (flow.step !== TransferFlowStep.Submitting) {
    dispatchTransferFlow(
      flow.step === TransferFlowStep.Approving
        ? {
            type: TransferFlowActionType.ApprovalNotSent,
            notice: TransferFlowScenario.ApprovalUnexpected,
          }
        : {
            type: TransferFlowActionType.CreateNotSent,
            notice: TransferFlowScenario.ReviewUnexpected,
          },
    );
    return;
  }
  void settleApprovalAnswer({
    answer: {},
    transferId: flow.transferId,
    // Only a refusal forgets the record, and an answer with nothing in it is none.
    forgetPendingTransfer: () => Promise.resolve(),
    queryClient,
  });
}
