import {
  getTransferOptions,
  isSettledTransferOutcome,
  outcomeOfTransfer,
  type TransferOutcomeScenario,
  useGetTransfer,
} from "@/domains/transfer/api/get-transfer/get-transfer";
import { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import {
  classifyTransferReadFailure,
  TransferReadFailure,
  UNSETTLED_TRANSFER_READ_INTERVAL_MS,
} from "@/domains/transfer/lib/transfer-status-checks/transfer-status-checks";
import { useInitialValue } from "@/shared/hooks/use-initial-value/use-initial-value";
import { useQueryError } from "@/shared/hooks/use-query-error/use-query-error";
import { hashKey, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export function useTransferOutcomeScenario(
  transferId: string,
  checking: string | undefined,
) {
  const queryClient = useQueryClient();
  const [unansweredReads, setUnansweredReads] = useState(0);
  const openedAtMs = useInitialValue(Date.now);
  const transfer = useGetTransfer(transferId, {
    retry: 0,
    refetchInterval: ({ state }) => {
      const outcome = state.data && outcomeOfTransfer(state.data);
      const failure = classifyTransferReadFailure(state.error);
      if (
        isSettledTransferOutcome(outcome) ||
        (failure !== undefined && failure !== TransferReadFailure.BankUnreached)
      )
        return false;
      const elapsedMs = Date.now() - openedAtMs;
      const nextReadAtMs =
        STATUS_READ_TIMES_MS.find((readAtMs) => readAtMs > elapsedMs) ??
        elapsedMs + UNSETTLED_TRANSFER_READ_INTERVAL_MS;
      return nextReadAtMs - elapsedMs;
    },
  });
  // Opened without the approve call's answer in hand, nothing has confirmed what the approval did.
  const isCheckingUnansweredApproval = useInitialValue(
    () => checking !== undefined || transfer.dataUpdatedAt === 0,
  );
  // Showing the raw failure would flip the page back to "checking" on each re-read.
  const errorShown = useQueryError(
    transfer.error,
    transfer.data === undefined && transfer.fetchStatus !== "idle",
  );
  const failureShown = classifyTransferReadFailure(errorShown);
  const scenario = decideScenario({
    outcome: transfer.data?.outcome,
    failure: failureShown,
    isCheckingUnansweredApproval,
    isBankUnreachable:
      failureShown === TransferReadFailure.BankUnreached &&
      unansweredReads >= UNANSWERED_READS_BEFORE_UNREACHABLE &&
      // A read on returning to the app adds to the count early, so the front-loaded reads must all have run too.
      transfer.errorUpdatedAt - openedAtMs >= Math.max(...STATUS_READ_TIMES_MS),
    checking,
  });
  // Read by read: the query's error count cannot say whether its read on opening, not a scheduled one, failed.
  useEffect(() => {
    const transferQueryHash = hashKey(getTransferOptions(transferId).queryKey);
    let hasOpeningReadSettled = false;
    return queryClient.getQueryCache().subscribe((event) => {
      if (
        event.type !== "updated" ||
        event.query.queryHash !== transferQueryHash
      )
        return;
      const { action } = event;
      if (action.type !== "success" && action.type !== "error") return;
      if (
        hasOpeningReadSettled &&
        action.type === "error" &&
        classifyTransferReadFailure(action.error) ===
          TransferReadFailure.BankUnreached
      )
        setUnansweredReads((count) => count + 1);
      hasOpeningReadSettled = true;
    });
  }, [queryClient, transferId]);
  return {
    transfer,
    failureLatestRead: classifyTransferReadFailure(transfer.error),
    scenario,
  };
}

// The schedule is each read's retry, front-loaded while the bank's answer is likeliest to land.
const STATUS_READ_TIMES_MS = [2_000, 4_000, 8_000, 16_000];

const UNANSWERED_READS_BEFORE_UNREACHABLE = 4;

function decideScenario({
  outcome,
  failure,
  isCheckingUnansweredApproval,
  isBankUnreachable,
  checking,
}: {
  outcome: TransferOutcomeScenario | null | undefined;
  failure: TransferReadFailure | undefined;
  isCheckingUnansweredApproval: boolean;
  isBankUnreachable: boolean;
  checking: string | undefined;
}): TransferOutcomeScenario {
  // A later read that fails never hides an outcome the bank has already settled.
  if (isSettledTransferOutcome(outcome)) return outcome;
  if (failure === TransferReadFailure.NotFound)
    return TransferScenarioId.LastTransferNotFound;
  if (
    failure === TransferReadFailure.Unexpected ||
    outcome === TransferScenarioId.OutcomeUnexpected
  )
    return isCheckingUnansweredApproval
      ? TransferScenarioId.RecoveryUnexpected
      : TransferScenarioId.OutcomeUnexpected;
  if (outcome) return outcome;
  if (isBankUnreachable) return TransferScenarioId.StatusUnreachable;
  return (
    (
      [
        TransferScenarioId.ApprovalUnknownAnswer,
        TransferScenarioId.AppClosedDuringApproval,
      ] as const
    ).find((reason) => reason === checking) ??
    TransferScenarioId.ApprovalUnanswered
  );
}
