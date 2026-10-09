import type { QueryClient } from "@tanstack/react-query";
import { router } from "expo-router";

import { closeApprovalPinSheet } from "@/domains/approval/hooks/approval-pin-sheet";
import {
  ApproveRequestNotSentError,
  readApproveTransferRefusal,
} from "@/domains/transfer/api/approve-transfer/approve-transfer";
import { ApproveTransferErrorCode } from "@/domains/transfer/api/approve-transfer/approve-transfer.type";
import { outcomeOfTransfer } from "@/domains/transfer/api/get-transfer/get-transfer";
import {
  type Transfer,
  TransferFailureReason,
  TransferFunds,
  TransferStatus,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import { clearPendingTransfer } from "@/domains/transfer/hooks/pending-transfers";
import { settlePendingTransfer } from "@/domains/transfer/hooks/transfer-status-checks";
import { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import { isFlowNoLongerOnTransfer } from "@/screens/transfer/state/approval-events";
import { refreshAccountHistoryAndRecentRecipientsAfterApproval } from "@/screens/transfer/state/refresh-after-approval";
import {
  dispatchTransferFlow,
  TransferFlowActionType,
  TransferHoldKind,
  transferFlowStore,
} from "@/screens/transfer/state/transfer-flow";
import type { ApprovalEvent } from "@/screens/transfer/state/transfer-flow.type";
import { reportError } from "@/shared/observability/observability";

export async function settleApprovalAnswer({
  answer: { transfer, failure },
  transferId,
  customerId,
  queryClient,
}: {
  answer: { transfer?: Transfer; failure?: unknown };
  transferId: string;
  customerId: string;
  queryClient: QueryClient;
}) {
  closeApprovalPinSheet();
  if (failure instanceof ApproveRequestNotSentError) {
    dispatchTransferFlow({
      type: TransferFlowActionType.ApprovalNotSent,
      notice: TransferScenarioId.ApprovalUnexpected,
    });
    return;
  }
  const returnRefusedApprovalToReview = async (event: ApprovalEvent) => {
    await clearPendingTransfer(customerId, transferId).catch(
      (error: unknown) => {
        reportError(error, { boundary: "pending_transfer_clear" });
      },
    );
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
      notice: TransferScenarioId.BalanceOrLimitShortAtApproval,
    });
    return;
  }
  const refusal = readApproveTransferRefusal(failure);
  switch (refusal?.code) {
    case ApproveTransferErrorCode.ApprovalExpired:
      await returnRefusedApprovalToReview({
        type: TransferFlowActionType.ApprovalNotSent,
        notice: TransferScenarioId.ApprovalExpired,
      });
      return;
    case ApproveTransferErrorCode.ApprovalInvalid:
      await returnRefusedApprovalToReview({
        type: TransferFlowActionType.ApprovalNotSent,
        notice: TransferScenarioId.ApprovalNotVerified,
      });
      return;
    case ApproveTransferErrorCode.KeyNotRegistered:
      await returnRefusedApprovalToReview({
        type: TransferFlowActionType.ApprovalNotSent,
        notice: TransferScenarioId.ApprovalKeyUnknown,
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
        notice: TransferScenarioId.ApprovalUnexpected,
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

  // Here, not only on the result page: Back can skip that page as it opens, and Home and review must still warn or
  // announce. Awaited, so the page's own settle always comes after.
  await settlePendingTransfer({
    queryClient,
    customerId,
    transferId,
    outcome: transfer && outcomeOfTransfer(transfer),
    reference: transfer?.reference,
    keepSettled: true,
  }).catch((error: unknown) => {
    reportError(error, { boundary: "pending_transfer" });
  });
  // ⛔ Read after the wait: a demo reset meanwhile leaves no transfer for a result page.
  if (isFlowNoLongerOnTransfer(transferFlowStore.getState(), transferId))
    return;
  openResultPageOfSentApproval({
    queryClient,
    transferId,
    answered: transfer !== undefined,
    unknownAnswer:
      refusal !== undefined &&
      !Object.values<string>(ApproveTransferErrorCode).includes(refusal.code),
  });
}

// Any answer but a refusal, an unknown code and none at all included, may hide moved money, so only the result page may say.
export function openResultPageOfSentApproval({
  queryClient,
  transferId,
  answered,
  unknownAnswer,
}: {
  queryClient: QueryClient;
  transferId: string;
  answered: boolean;
  unknownAnswer: boolean;
}) {
  void refreshAccountHistoryAndRecentRecipientsAfterApproval(queryClient);
  // From Home, so Back from the result never reopens a transfer already sent.
  router.dismissTo("/");
  router.push({
    pathname: "/transfer/result/[transferId]",
    params: {
      transferId,
      ...(unknownAnswer && {
        checking: TransferScenarioId.ApprovalUnknownAnswer,
      }),
    },
  });
  dispatchTransferFlow({
    type: answered
      ? TransferFlowActionType.ApprovalAnswered
      : TransferFlowActionType.AnswerLost,
  });
}
