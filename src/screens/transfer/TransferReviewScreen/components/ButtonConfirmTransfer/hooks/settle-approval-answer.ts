import type { QueryClient } from "@tanstack/react-query";
import { router } from "expo-router";

import { closeApprovalPinSheet } from "@/domains/approval/hooks/approval-pin-sheet";
import { ApproveRequestNotSentError } from "@/domains/transfer/api/approve-transfer/approve-transfer";
import {
  ApproveTransferErrorCode,
  type ApproveTransferErrorResponse,
} from "@/domains/transfer/api/approve-transfer/approve-transfer.type";
import { TransferOutcomeScenario } from "@/domains/transfer/api/get-transfer/get-transfer";
import {
  type Transfer,
  TransferFailureReason,
  TransferFunds,
  TransferStatus,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import { isFlowNoLongerOnTransfer } from "@/screens/transfer/state/approval-events";
import { refreshAccountHistoryAndRecentRecipientsAfterApproval } from "@/screens/transfer/state/refresh-after-approval";
import {
  dispatchTransferFlow,
  TransferFlowActionType,
  TransferFlowScenario,
  TransferHoldKind,
  transferFlowStore,
} from "@/screens/transfer/state/transfer-flow";
import type { ApprovalEvent } from "@/screens/transfer/state/transfer-flow.type";
import {
  TransportError,
  TransportErrorKind,
} from "@/shared/http/transport-error";

export async function settleApprovalAnswer({
  answer: { transfer, failure },
  transferId,
  forgetPendingTransfer,
  queryClient,
}: {
  answer: { transfer?: Transfer; failure?: unknown };
  transferId: string;
  forgetPendingTransfer: () => Promise<void>;
  queryClient: QueryClient;
}) {
  closeApprovalPinSheet();
  if (failure instanceof ApproveRequestNotSentError) {
    dispatchTransferFlow({
      type: TransferFlowActionType.ApprovalNotSent,
      notice: TransferFlowScenario.ApprovalUnexpected,
    });
    return;
  }
  const returnRefusedApprovalToReview = async (event: ApprovalEvent) => {
    await forgetPendingTransfer();
    if (!isFlowNoLongerOnTransfer(transferFlowStore.getState(), transferId))
      dispatchTransferFlow(event);
  };

  if (
    transfer?.status === TransferStatus.Unsuccessful &&
    transfer.funds === TransferFunds.NotDebited &&
    (transfer.failureReason === TransferFailureReason.InsufficientFunds ||
      transfer.failureReason === TransferFailureReason.DailyLimitExceeded)
  ) {
    // The amount step they go back to checks against the figures that just fell short.
    void refreshAccountHistoryAndRecentRecipientsAfterApproval(queryClient);
    await returnRefusedApprovalToReview({
      type: TransferFlowActionType.ApprovalNotSent,
      notice: TransferFlowScenario.BalanceOrLimitShortAtApproval,
    });
    return;
  }
  const refusal =
    failure instanceof TransportError &&
    failure.kind === TransportErrorKind.Http
      ? (failure.body as ApproveTransferErrorResponse | undefined)?.error
      : undefined;
  switch (refusal?.code) {
    case ApproveTransferErrorCode.ApprovalExpired:
      await returnRefusedApprovalToReview({
        type: TransferFlowActionType.ApprovalNotSent,
        notice: TransferFlowScenario.ApprovalExpired,
      });
      return;
    case ApproveTransferErrorCode.ApprovalInvalid:
      await returnRefusedApprovalToReview({
        type: TransferFlowActionType.ApprovalNotSent,
        notice: TransferFlowScenario.ApprovalNotVerified,
      });
      return;
    case ApproveTransferErrorCode.KeyNotRegistered:
      await returnRefusedApprovalToReview({
        type: TransferFlowActionType.ApprovalNotSent,
        notice: TransferFlowScenario.ApprovalKeyUnknown,
      });
      return;
    case ApproveTransferErrorCode.AccountLocked:
      await returnRefusedApprovalToReview({
        type: TransferFlowActionType.ApproveRefusedByHold,
        hold: { kind: TransferHoldKind.AccountLocked },
      });
      return;
    case ApproveTransferErrorCode.CoolingOff:
      await returnRefusedApprovalToReview({
        type: TransferFlowActionType.ApproveRefusedByHold,
        hold: {
          kind: TransferHoldKind.CoolingOff,
          ...(Date.parse(refusal.until) > Date.now() && {
            until: refusal.until,
          }),
          reason: refusal.reason,
        },
      });
      return;
    case ApproveTransferErrorCode.InvalidRequest:
      await returnRefusedApprovalToReview({
        type: TransferFlowActionType.ApprovalNotSent,
        notice: TransferFlowScenario.ApprovalUnexpected,
      });
      return;
    // The PIN path answers its own PIN refusals; one here came after the approval left the phone, so it is a lost answer.
    case ApproveTransferErrorCode.PinIncorrect:
    case ApproveTransferErrorCode.PinLocked:
    case ApproveTransferErrorCode.TransferNotFound:
    case ApproveTransferErrorCode.IdempotencyKeyReused:
    case ApproveTransferErrorCode.RequestInProgress:
    case undefined:
      break;
  }

  // Any other answer, an unknown code included, may hide moved money, so only the result page may say.
  void refreshAccountHistoryAndRecentRecipientsAfterApproval(queryClient);
  // From Home, so Back from the result never reopens a transfer already sent.
  router.dismissTo("/");
  router.push({
    pathname: "/transfer/result/[transferId]",
    params: {
      transferId,
      ...(refusal !== undefined &&
        !Object.values<string>(ApproveTransferErrorCode).includes(
          refusal.code,
        ) && { checking: TransferOutcomeScenario.ApprovalUnknownAnswer }),
    },
  });
  dispatchTransferFlow({
    type:
      transfer === undefined
        ? TransferFlowActionType.AnswerLost
        : TransferFlowActionType.ApprovalAnswered,
  });
}
