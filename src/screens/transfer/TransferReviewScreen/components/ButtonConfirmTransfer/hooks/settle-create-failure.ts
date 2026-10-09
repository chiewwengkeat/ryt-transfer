import type { QueryClient } from "@tanstack/react-query";
import { router } from "expo-router";

import { accountKeys } from "@/domains/account/api/account.keys";
import { readCreateTransferRefusal } from "@/domains/transfer/api/create-transfer/create-transfer";
import { CreateTransferErrorCode } from "@/domains/transfer/api/create-transfer/create-transfer.type";
import {
  dispatchTransferFlow,
  TransferFlowActionType,
  TransferFlowScenario,
  TransferHoldKind,
} from "@/screens/transfer/state/transfer-flow";
import {
  isSessionEndFailure,
  isUnansweredWriteFailure,
} from "@/shared/http/transport-error";

export function settleCreateFailure({
  failure,
  queryClient,
  checkTheNameAgain,
}: {
  failure: unknown;
  queryClient: QueryClient;
  checkTheNameAgain: () => void;
}) {
  if (isSessionEndFailure(failure)) {
    dispatchTransferFlow({ type: TransferFlowActionType.CreateNotSent });
    return;
  }
  if (isUnansweredWriteFailure(failure)) {
    dispatchTransferFlow({
      type: TransferFlowActionType.CreateUnanswered,
      notice: TransferFlowScenario.ConfirmationUnanswered,
    });
    return;
  }
  const refusal = readCreateTransferRefusal(failure);
  switch (refusal?.code) {
    case CreateTransferErrorCode.CoolingOff:
      dispatchTransferFlow({
        type: TransferFlowActionType.CreateRefusedByHold,
        hold: {
          kind: TransferHoldKind.CoolingOff,
          ...(Date.parse(refusal.until) > Date.now() && {
            until: refusal.until,
          }),
          reason: refusal.reason,
        },
      });
      return;
    case CreateTransferErrorCode.AccountLocked:
      dispatchTransferFlow({
        type: TransferFlowActionType.CreateRefusedByHold,
        hold: { kind: TransferHoldKind.AccountLocked },
      });
      return;
    case CreateTransferErrorCode.InsufficientFunds:
    case CreateTransferErrorCode.DailyLimitExceeded:
    case CreateTransferErrorCode.AbovePerTransferMax:
      // The figures the amount step checked against are stale now, so it reads them again.
      void queryClient.invalidateQueries({ queryKey: accountKeys.all });
      dispatchTransferFlow({
        type: TransferFlowActionType.CreateNotSent,
        notice: TransferFlowScenario.BalanceOrLimitShortAtConfirmation,
        noticeDetail: { code: refusal.code },
      });
      return;
    case CreateTransferErrorCode.AmountInvalid:
    case CreateTransferErrorCode.NoteInvalid:
      if (
        dispatchTransferFlow({
          type: TransferFlowActionType.CreateReturnedToAmount,
          notice: TransferFlowScenario.BadlyFormedInput,
          noticeDetail: { code: refusal.code },
        })
      )
        router.dismissTo("/transfer/amount");
      return;
    case CreateTransferErrorCode.RecipientRefExpired:
      dispatchTransferFlow({
        type: TransferFlowActionType.CreateNotSent,
        notice: TransferFlowScenario.NameCheckExpired,
      });
      checkTheNameAgain();
      return;
    case CreateTransferErrorCode.ServiceUnavailable:
      // Home reads maintenance off the limits, so they are read again before the person returns there.
      void queryClient.invalidateQueries({
        queryKey: accountKeys.transferLimits,
      });
      dispatchTransferFlow({
        type: TransferFlowActionType.CreateNotSent,
        notice: TransferFlowScenario.UnderMaintenance,
        // An unreadable time is dropped: formatting it throws, and the words without a time still serve.
        noticeDetail: {
          until: Number.isNaN(Date.parse(refusal.until ?? ""))
            ? undefined
            : refusal.until,
        },
      });
      return;
    // The bank is still on the first request under this key, so a repeat of it later gets that one's answer.
    case CreateTransferErrorCode.RequestInProgress:
      dispatchTransferFlow({
        type: TransferFlowActionType.CreateUnanswered,
        notice: TransferFlowScenario.ConfirmationUnanswered,
      });
      return;
    case CreateTransferErrorCode.IdempotencyKeyReused:
    case CreateTransferErrorCode.InvalidRequest:
    case undefined:
    default:
      dispatchTransferFlow({
        type: TransferFlowActionType.CreateNotSent,
        notice: TransferFlowScenario.ReviewUnexpected,
      });
  }
}
