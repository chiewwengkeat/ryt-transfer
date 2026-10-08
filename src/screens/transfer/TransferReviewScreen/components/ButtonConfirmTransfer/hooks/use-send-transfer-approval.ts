import { useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { router } from "expo-router";

import { useGetPrimaryAccount } from "@/domains/account/api/get-primary-account/get-primary-account";
import { approvalSettingsStore } from "@/domains/approval/hooks/approval-settings";
import {
  APPROVAL_REFUSAL_CODES,
  ApproveRequestNotSentError,
  useApproveTransfer,
} from "@/domains/transfer/api/approve-transfer/approve-transfer";
import { refreshAccountAndHistoryAfterApproval } from "@/screens/transfer/state/refresh-after-approval";
import {
  dispatchTransferFlow,
  TransferFlowActionType,
  TransferFlowScenario,
  TransferFlowStep,
  transferFlowStore,
} from "@/screens/transfer/state/transfer-flow";
import {
  TransportError,
  TransportErrorKind,
} from "@/shared/http/transport-error";

import { useSignTransferApproval } from "./use-sign-transfer-approval";

export function useSendTransferApproval() {
  const queryClient = useQueryClient();
  const customerId = useGetPrimaryAccount().data?.customerId;
  const signTransferApproval = useSignTransferApproval();
  const approveTransfer = useApproveTransfer();

  return async () => {
    const approving = transferFlowStore.getState();
    if (approving.step !== TransferFlowStep.Approving) return;
    if (customerId === undefined) {
      dispatchTransferFlow({
        type: TransferFlowActionType.ApprovalNotSent,
        notice: TransferFlowScenario.ApprovalUnexpected,
      });
      return;
    }
    if (!approvalSettingsStore.getState().biometricApprovalOn) {
      dispatchTransferFlow({
        type: TransferFlowActionType.ApprovalNotSent,
        notice: TransferFlowScenario.BiometricsUnavailable,
      });
      return;
    }
    const { transferId, lookup } = approving;
    const signedApproval = await signTransferApproval({
      transferId,
      challenge: approving.challenge,
      recipientRef: lookup.recipientRef,
      registeredName: lookup.recipient.registeredName,
      idValueMasked: lookup.recipient.idValueMasked,
      bankCode: lookup.recipient.bankCode,
      amount: approving.draft.amount,
    });
    if (signedApproval === null) {
      dispatchTransferFlow({
        type: TransferFlowActionType.ApprovalNotSent,
        notice: TransferFlowScenario.ApprovalCancelled,
      });
      return;
    }
    const attemptKey = randomUUID();
    if (
      !dispatchTransferFlow({
        type: TransferFlowActionType.ApprovalSent,
        attemptKey,
      })
    )
      return;

    let answerLost = false;
    try {
      await approveTransfer.mutateAsync({
        customerId,
        transferId,
        request: signedApproval,
        idempotencyKey: attemptKey,
      });
    } catch (error) {
      if (error instanceof ApproveRequestNotSentError) {
        dispatchTransferFlow({
          type: TransferFlowActionType.ApprovalNotSent,
          notice: TransferFlowScenario.ApprovalUnexpected,
        });
        return;
      }
      if (
        error instanceof TransportError &&
        error.kind === TransportErrorKind.Http &&
        error.code !== undefined &&
        APPROVAL_REFUSAL_CODES.has(error.code)
      ) {
        dispatchTransferFlow({
          type: TransferFlowActionType.ApprovalNotSent,
          notice: TransferFlowScenario.ApprovalCancelled,
        });
        return;
      }
      // The approval left the phone and nothing proves where it ended, so only the result page may say.
      answerLost = true;
    }
    void refreshAccountAndHistoryAfterApproval(queryClient);
    // From Home, so Back from the result never reopens a transfer already sent.
    router.dismissTo("/");
    router.push(`/transfer/result/${transferId}`);
    dispatchTransferFlow({
      type: answerLost
        ? TransferFlowActionType.AnswerLost
        : TransferFlowActionType.ApprovalAnswered,
    });
  };
}
