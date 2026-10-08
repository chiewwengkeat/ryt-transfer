import type { QueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import {
  TransportError,
  TransportErrorKind,
} from "@/shared/http/transport-error";
import { reportError } from "@/shared/observability/observability";

import {
  getTransferOptions,
  outcomeOfTransfer,
  TransferOutcomeScenario,
  useGetTransfer,
} from "../api/get-transfer/get-transfer";
import { GetTransferErrorCode } from "../api/get-transfer/get-transfer.type";
import {
  clearPendingTransfer,
  PendingTransferStage,
  updatePendingTransferStage,
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
  const [openedAtMs] = useState(Date.now);
  const transfer = useGetTransfer(transferId, {
    retry: 0,
    refetchInterval: ({ state }) => {
      const outcome = state.data && outcomeOfTransfer(state.data);
      const failure = classifyTransferReadFailure(state.error);
      if (
        !transferStillSettling(outcome) ||
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
  const [failedReadsBeforeOpening] = useState(transfer.errorUpdateCount);
  const readFailure = classifyTransferReadFailure(transfer.error);
  const outcome = transfer.data?.outcome;

  useEffect(() => {
    if (customerId === undefined) return;
    const recordChange =
      readFailure === TransferReadFailure.NotFound ||
      !transferStillSettling(outcome)
        ? clearPendingTransfer(customerId, transferId)
        : outcome === TransferOutcomeScenario.Processing ||
            outcome === TransferOutcomeScenario.HeldForReview
          ? updatePendingTransferStage(
              customerId,
              transferId,
              PendingTransferStage.Processing,
            )
          : undefined;
    recordChange?.catch((error: unknown) => {
      reportError(error, { boundary: "pending_transfer" });
    });
  }, [customerId, transferId, outcome, readFailure]);

  return {
    transfer,
    readFailure,
    bankUnreachable:
      readFailure === TransferReadFailure.BankUnreached &&
      transfer.dataUpdatedAt < openedAtMs &&
      transfer.errorUpdateCount - failedReadsBeforeOpening >=
        UNANSWERED_READS_BEFORE_UNREACHABLE,
  };
}

// One read per record, as at launch: a settled one is kept for Home to announce.
export async function checkPendingTransferOnce(
  queryClient: QueryClient,
  customerId: string,
  transferId: string,
) {
  try {
    const outcome = outcomeOfTransfer(
      await queryClient.fetchQuery({
        ...getTransferOptions(transferId),
        retry: 0,
      }),
    );
    if (
      outcome === TransferOutcomeScenario.Processing ||
      outcome === TransferOutcomeScenario.HeldForReview
    )
      await updatePendingTransferStage(
        customerId,
        transferId,
        PendingTransferStage.Processing,
      );
  } catch (error) {
    if (classifyTransferReadFailure(error) === TransferReadFailure.NotFound)
      await clearPendingTransfer(customerId, transferId);
  }
}

// Undefined while there is no data: a read that has not answered yet has not settled anything.
function transferStillSettling(
  outcome: TransferOutcomeScenario | null | undefined,
) {
  return (
    outcome === undefined ||
    outcome === null ||
    outcome === TransferOutcomeScenario.Processing ||
    outcome === TransferOutcomeScenario.HeldForReview
  );
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
