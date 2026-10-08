import {
  hashKey,
  type QueryClient,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useState } from "react";

import {
  TransportError,
  TransportErrorKind,
} from "@/shared/http/transport-error";
import { reportError } from "@/shared/observability/observability";

import {
  getTransferOptions,
  isSettledTransferOutcome,
  outcomeOfTransfer,
  type TransferOutcomeScenario,
  useGetTransfer,
} from "../api/get-transfer/get-transfer";
import { GetTransferErrorCode } from "../api/get-transfer/get-transfer.type";
import { refreshPendingTransferNotices } from "./pending-transfer-notices";
import {
  clearPendingTransfer,
  PendingTransferStage,
  updatePendingTransfer,
} from "./pending-transfers";

// The schedule is each read's retry, front-loaded while the bank's answer is likeliest to land.
const STATUS_READ_TIMES_MS = [2_000, 4_000, 8_000, 16_000];
const STATUS_READ_INTERVAL_MS_AFTER = 15_000;
const UNANSWERED_READS_BEFORE_UNREACHABLE = 4;

export enum TransferReadFailure {
  NotFound = "not_found",
  BankUnreached = "bank_unreached",
  Unexpected = "unexpected",
}

export function useTransferStatusCheck(
  transferId: string,
  customerId: string | undefined,
) {
  const queryClient = useQueryClient();
  const [openedAtMs] = useState(Date.now);
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
        elapsedMs + STATUS_READ_INTERVAL_MS_AFTER;
      return nextReadAtMs - elapsedMs;
    },
  });
  const [unansweredReads, setUnansweredReads] = useState(0);
  const readFailure = classifyTransferReadFailure(transfer.error);
  const outcome = transfer.data?.outcome;
  const reference = transfer.data?.reference;

  // Read by read: the query's error count cannot say whether its read on opening, not a scheduled one, failed.
  useEffect(() => {
    const transferQueryHash = hashKey(getTransferOptions(transferId).queryKey);
    let openingReadSettled = false;
    return queryClient.getQueryCache().subscribe((event) => {
      if (
        event.type !== "updated" ||
        event.query.queryHash !== transferQueryHash
      )
        return;
      const { action } = event;
      if (action.type !== "success" && action.type !== "error") return;
      if (
        openingReadSettled &&
        action.type === "error" &&
        classifyTransferReadFailure(action.error) ===
          TransferReadFailure.BankUnreached
      )
        setUnansweredReads((count) => count + 1);
      openingReadSettled = true;
    });
  }, [queryClient, transferId]);

  useEffect(() => {
    if (customerId === undefined) return;
    void (async () => {
      if (readFailure === TransferReadFailure.NotFound) {
        await clearPendingTransfer(customerId, transferId);
        await refreshPendingTransferNotices(queryClient, customerId);
      } else
        await settlePendingTransfer({
          queryClient,
          customerId,
          transferId,
          outcome,
          reference,
        });
    })().catch((error: unknown) => {
      reportError(error, { boundary: "pending_transfer" });
    });
  }, [customerId, transferId, outcome, reference, readFailure, queryClient]);

  return {
    transfer,
    readFailure,
    bankUnreachable:
      readFailure === TransferReadFailure.BankUnreached &&
      unansweredReads >= UNANSWERED_READS_BEFORE_UNREACHABLE &&
      // A read on returning to the app adds to the count early, so the front-loaded reads must all have run too.
      transfer.errorUpdatedAt - openedAtMs >= Math.max(...STATUS_READ_TIMES_MS),
  };
}

// One read per record, as at launch: a settled one is kept for Home to announce.
export async function checkPendingTransferOnce(
  queryClient: QueryClient,
  customerId: string,
  transferId: string,
) {
  try {
    const transfer = await queryClient.fetchQuery({
      ...getTransferOptions(transferId),
      retry: 0,
    });
    const outcome = outcomeOfTransfer(transfer);
    if (!isSettledTransferOutcome(outcome))
      await recordUnsettledPendingTransfer(
        customerId,
        transferId,
        outcome,
        transfer.reference,
      );
  } catch (error) {
    if (classifyTransferReadFailure(error) === TransferReadFailure.NotFound)
      await clearPendingTransfer(customerId, transferId);
  }
}

// Unlike checkPendingTransferOnce, a settled outcome clears the record rather than keeping it for Home to announce.
export async function settlePendingTransfer({
  queryClient,
  customerId,
  transferId,
  outcome,
  reference,
}: {
  queryClient: QueryClient;
  customerId: string;
  transferId: string;
  outcome?: TransferOutcomeScenario | null;
  reference?: string;
}) {
  if (isSettledTransferOutcome(outcome))
    await clearPendingTransfer(customerId, transferId);
  else
    await recordUnsettledPendingTransfer(
      customerId,
      transferId,
      outcome,
      reference,
    );
  await refreshPendingTransferNotices(queryClient, customerId);
}

function recordUnsettledPendingTransfer(
  customerId: string,
  transferId: string,
  outcome: TransferOutcomeScenario | null | undefined,
  reference: string | undefined,
) {
  return updatePendingTransfer(customerId, transferId, {
    ...(reference !== undefined && { reference }),
    // An outcome named means the bank holds the approval, so the next launch warns on Home rather than reopening Result.
    ...(outcome !== undefined &&
      outcome !== null && { stage: PendingTransferStage.Processing }),
  });
}

function classifyTransferReadFailure(error: unknown) {
  if (error === null || error === undefined) return undefined;
  if (!(error instanceof TransportError)) return TransferReadFailure.Unexpected;
  if (error.code === GetTransferErrorCode.TransferNotFound)
    return TransferReadFailure.NotFound;
  // None of these is the bank answering about the transfer; the session-ended view handles a 401.
  return error.kind === TransportErrorKind.Network ||
    error.kind === TransportErrorKind.Timeout ||
    error.kind === TransportErrorKind.Aborted ||
    (error.kind === TransportErrorKind.Http &&
      (error.status === 401 || (error.status ?? 0) >= 500))
    ? TransferReadFailure.BankUnreached
    : TransferReadFailure.Unexpected;
}
