import {
  type InfiniteData,
  queryOptions,
  useQuery,
} from "@tanstack/react-query";

import { requestJson } from "@/shared/http/transport";
import { parseWireAmount } from "@/shared/lib/money/money";
import { trackEvent } from "@/shared/observability/observability";

import { patchTransferInHistory } from "../list-transfers/list-transfers";
import type { ListTransfersResponse } from "../list-transfers/list-transfers.type";
import { transferKeys } from "../transfer.keys";
import {
  type GetTransferResponse,
  type Transfer,
  TransferFailureReason,
  TransferFunds,
  TransferStatus,
} from "./get-transfer.type";

// App code may not import the registry's id type, so these restate its ids.
export enum TransferOutcomeScenario {
  Completed = "transfer.completed",
  Processing = "transfer.processing",
  HeldForReview = "transfer.held_for_review",
  FraudBlocked = "transfer.fraud_blocked",
  RecipientAccountInactive = "transfer.recipient_account_inactive",
  RefundedAfterProcessing = "transfer.refunded_after_processing",
  BalanceOrLimitShortAtApproval = "transfer.balance_or_limit_short_at_approval",
  ApprovalExpired = "transfer.approval_expired",
  OutcomeUnexpected = "transfer.outcome_unexpected",
  ApprovalUnanswered = "transfer.approval_unanswered",
  ApprovalUnknownAnswer = "transfer.approval_unknown_answer",
  AppClosedDuringApproval = "transfer.app_closed_during_approval",
  StatusUnreachable = "transfer.status_unreachable",
  LastTransferNotFound = "transfer.last_transfer_not_found",
  RecoveryUnexpected = "transfer.recovery_unexpected",
}

export const getTransferOptions = (transferId: string) =>
  queryOptions({
    queryKey: transferKeys.detail(transferId),
    queryFn: async ({ client, signal }) => {
      const { transfer } = await requestJson<GetTransferResponse>(
        `/transfers/${encodeURIComponent(transferId)}`,
        { signal },
      );
      // Patching cancels history's own loads first, so only a copy there that this read outdates earns it.
      const historyHoldsAnOlderCopy = client
        .getQueriesData<InfiniteData<ListTransfersResponse>>({
          queryKey: transferKeys.historyAll,
        })
        .some(([, history]) =>
          history?.pages.some(({ items }) =>
            items.some(
              (item) =>
                item.transferId === transfer.transferId &&
                item.version < transfer.version,
            ),
          ),
        );
      if (historyHoldsAnOlderCopy)
        await patchTransferInHistory(client, transfer);
      return transfer;
    },
    // An answer that left before a newer copy arrived must not replace it. Query also runs this on select
    // results, where the held copy can belong to the transfer shown before.
    structuralSharing: (held: unknown, received: unknown) =>
      held !== undefined &&
      (held as Transfer).transferId === (received as Transfer).transferId &&
      (held as Transfer).version >= (received as Transfer).version
        ? held
        : received,
  });

export function useGetTransfer(
  transferId: string,
  options?: Pick<
    ReturnType<typeof getTransferOptions>,
    "retry" | "refetchInterval"
  >,
) {
  return useQuery({
    ...getTransferOptions(transferId),
    select: selectTransferWithOutcome,
    ...options,
  });
}

export function selectTransferWithOutcome(transfer: Transfer) {
  const amount = parseWireAmount(transfer.amount);
  if (!amount) {
    trackEvent("unreadable_amount", { boundary: "transfer" });
    throw new TypeError("The transfer's amount is unreadable.");
  }
  return { ...transfer, amount, outcome: outcomeOfTransfer(transfer) };
}

// Null while the bank still awaits the approval: it has no outcome to give yet.
export function outcomeOfTransfer({
  status,
  funds,
  failureReason,
  underReview,
}: Transfer) {
  if (funds === TransferFunds.RefundPending || funds === TransferFunds.Refunded)
    return TransferOutcomeScenario.RefundedAfterProcessing;
  switch (status) {
    case TransferStatus.AwaitingApproval:
      return null;
    case TransferStatus.Processing:
      return underReview
        ? TransferOutcomeScenario.HeldForReview
        : TransferOutcomeScenario.Processing;
    case TransferStatus.Completed:
      return TransferOutcomeScenario.Completed;
    case TransferStatus.Expired:
      return TransferOutcomeScenario.ApprovalExpired;
    case TransferStatus.Unsuccessful:
      // Each of these says no money moved, so a debit the bank has not refunded is none of them.
      if (funds !== TransferFunds.NotDebited) break;
      switch (failureReason) {
        case TransferFailureReason.FraudBlocked:
          return TransferOutcomeScenario.FraudBlocked;
        case TransferFailureReason.RecipientAccountInactive:
          return TransferOutcomeScenario.RecipientAccountInactive;
        case TransferFailureReason.InsufficientFunds:
        case TransferFailureReason.DailyLimitExceeded:
          return TransferOutcomeScenario.BalanceOrLimitShortAtApproval;
        case TransferFailureReason.RecipientBankRejected:
        case undefined:
          break;
      }
  }
  return TransferOutcomeScenario.OutcomeUnexpected;
}
