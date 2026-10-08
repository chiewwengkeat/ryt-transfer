import type { QueryClient } from "@tanstack/react-query";

import { closeApprovalPinSheet } from "@/domains/approval/hooks/approval-pin-sheet";
import {
  dispatchTransferFlow,
  TransferFlowActionType,
  TransferFlowScenario,
  TransferFlowStep,
  transferFlowStore,
} from "@/screens/transfer/state/transfer-flow";

import { openResultPageOfSentApproval } from "./settle-approval-answer";

export function settleUnexpectedConfirmFailure(queryClient: QueryClient) {
  // A sheet left sending cannot be closed by the person, and nothing else will close it.
  closeApprovalPinSheet();
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
  openResultPageOfSentApproval({
    queryClient,
    transferId: flow.transferId,
    answered: false,
    unknownAnswer: false,
  });
}
