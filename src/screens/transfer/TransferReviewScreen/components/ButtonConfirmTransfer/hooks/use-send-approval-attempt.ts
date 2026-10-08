import { randomUUID } from "expo-crypto";

import { closeApprovalPinSheet } from "@/domains/approval/hooks/approval-pin-sheet";
import { useApproveTransfer } from "@/domains/transfer/api/approve-transfer/approve-transfer";
import type { ApproveTransferRequest } from "@/domains/transfer/api/approve-transfer/approve-transfer.type";
import { isFlowNoLongerOnTransfer } from "@/screens/transfer/state/approval-events";
import {
  dispatchTransferFlow,
  TransferFlowActionType,
  TransferFlowStep,
  transferFlowStore,
} from "@/screens/transfer/state/transfer-flow";

export function useSendApprovalAttempt() {
  const approveTransfer = useApproveTransfer();

  return async (attempt: {
    customerId: string;
    transferId: string;
    request: ApproveTransferRequest;
  }) => {
    // ⛔ A late call must not send once the flow has left this transfer, nor close a newer one's sheet.
    if (
      isFlowNoLongerOnTransfer(transferFlowStore.getState(), attempt.transferId)
    )
      return null;
    const attemptKey = randomUUID();
    if (
      !dispatchTransferFlow({
        type: TransferFlowActionType.ApprovalSent,
        attemptKey,
      })
    ) {
      closeApprovalPinSheet();
      return null;
    }
    const answer = await approveTransfer
      .mutateAsync({ ...attempt, idempotencyKey: attemptKey })
      .then(
        ({ transfer }) => ({ transfer, failure: undefined }),
        (failure: unknown) => ({ transfer: undefined, failure }),
      )
      .finally(() => {
        // Drops the finished call's variables, which carry the PIN on that path.
        approveTransfer.reset();
      });
    // ⛔ Every answer passes here before anything acts on it: the person may have left for another
    // transfer meanwhile, and an answer for an attempt the flow has left must change nothing.
    const flow = transferFlowStore.getState();
    return flow.step === TransferFlowStep.Submitting &&
      flow.attemptKey === attemptKey
      ? answer
      : null;
  };
}
