import { patchTransferInHistory } from "@/domains/transfer/api/list-transfers/list-transfers";
import type { ListTransfersResponse } from "@/domains/transfer/api/list-transfers/list-transfers.type";
import { transferKeys } from "@/domains/transfer/api/transfer.keys";
import { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import { requestJson } from "@/shared/http/transport/transport";
import { parseWireAmount } from "@/shared/lib/money/money";
import { trackEvent } from "@/shared/observability/observability/observability";
import {
  type InfiniteData,
  queryOptions,
  useQuery,
} from "@tanstack/react-query";
import {
  type GetTransferResponse,
  type Transfer,
  TransferFailureReason,
  TransferFunds,
  TransferStatus,
} from "./get-transfer.type";

export type TransferOutcomeScenario = Extract<
  TransferScenarioId,
  | TransferScenarioId.Completed
  | TransferScenarioId.Processing
  | TransferScenarioId.HeldForReview
  | TransferScenarioId.FraudBlocked
  | TransferScenarioId.RecipientAccountInactive
  | TransferScenarioId.RefundedAfterProcessing
  | TransferScenarioId.BalanceOrLimitShortAtApproval
  | TransferScenarioId.ApprovalExpired
  | TransferScenarioId.OutcomeUnexpected
  | TransferScenarioId.ApprovalUnanswered
  | TransferScenarioId.ApprovalUnknownAnswer
  | TransferScenarioId.AppClosedDuringApproval
  | TransferScenarioId.StatusUnreachable
  | TransferScenarioId.LastTransferNotFound
  | TransferScenarioId.RecoveryUnexpected
>;

// Each says where the money went. Any outcome not listed, a new one included, leaves the money unconfirmed.
export const SETTLED_TRANSFER_OUTCOMES = [
  TransferScenarioId.Completed,
  TransferScenarioId.FraudBlocked,
  TransferScenarioId.RecipientAccountInactive,
  TransferScenarioId.RefundedAfterProcessing,
  TransferScenarioId.BalanceOrLimitShortAtApproval,
  TransferScenarioId.ApprovalExpired,
] as const;

export function isSettledTransferOutcome(
  outcome: TransferOutcomeScenario | null | undefined,
): outcome is (typeof SETTLED_TRANSFER_OUTCOMES)[number] {
  return SETTLED_TRANSFER_OUTCOMES.some((settled) => settled === outcome);
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
  // Extract, not the return type alone: its members widen back to the whole enum once inside an object.
  const outcome: Extract<
    TransferOutcomeScenario | null,
    ReturnType<typeof outcomeOfTransfer>
  > = outcomeOfTransfer(transfer);
  return { ...transfer, amount, outcome };
}

// Null while the bank still awaits the approval: it has no outcome to give yet.
export function outcomeOfTransfer({
  status,
  funds,
  failureReason,
  underReview,
}: Transfer) {
  if (funds === TransferFunds.RefundPending || funds === TransferFunds.Refunded)
    return TransferScenarioId.RefundedAfterProcessing;
  switch (status) {
    case TransferStatus.AwaitingApproval:
      return null;
    case TransferStatus.Processing:
      return underReview
        ? TransferScenarioId.HeldForReview
        : TransferScenarioId.Processing;
    case TransferStatus.Completed:
      return TransferScenarioId.Completed;
    case TransferStatus.Expired:
      return TransferScenarioId.ApprovalExpired;
    case TransferStatus.Unsuccessful:
      // Each of these says no money moved, so a debit the bank has not refunded is none of them.
      if (funds !== TransferFunds.NotDebited) break;
      switch (failureReason) {
        case TransferFailureReason.FraudBlocked:
          return TransferScenarioId.FraudBlocked;
        case TransferFailureReason.RecipientAccountInactive:
          return TransferScenarioId.RecipientAccountInactive;
        case TransferFailureReason.InsufficientFunds:
        case TransferFailureReason.DailyLimitExceeded:
          return TransferScenarioId.BalanceOrLimitShortAtApproval;
        case TransferFailureReason.RecipientBankRejected:
        case undefined:
          break;
      }
  }
  return TransferScenarioId.OutcomeUnexpected;
}
