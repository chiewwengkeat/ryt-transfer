import type { QueryClient } from "@tanstack/react-query";

import { getPrimaryAccountOptions } from "@/domains/account/api/get-primary-account/get-primary-account";
import { closeApprovalPinSheet } from "@/domains/approval/hooks/approval-pin-sheet";
import {
  dispatchTransferFlow,
  TransferFlowActionType,
  TransferFlowScenario,
  TransferFlowStep,
  transferFlowStore,
} from "@/screens/transfer/state/transfer-flow";

import {
  openResultPageOfSentApproval,
  settleApprovalAnswer,
} from "./settle-approval-answer";

export async function settleUnexpectedConfirmFailure(queryClient: QueryClient) {
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
  const customerId = queryClient.getQueryData(
    getPrimaryAccountOptions().queryKey,
  )?.customerId;
  if (customerId === undefined) {
    openResultPageOfSentApproval({
      queryClient,
      transferId: flow.transferId,
      answered: false,
      unknownAnswer: false,
    });
    return;
  }
  await settleApprovalAnswer({
    answer: {},
    transferId: flow.transferId,
    customerId,
    queryClient,
  });
}
