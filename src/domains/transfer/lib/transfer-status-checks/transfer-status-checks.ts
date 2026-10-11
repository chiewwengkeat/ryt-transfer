import {
  getTransferOptions,
  isSettledTransferOutcome,
  outcomeOfTransfer,
} from "@/domains/transfer/api/get-transfer/get-transfer";
import { GetTransferErrorCode } from "@/domains/transfer/api/get-transfer/get-transfer.type";
import { refreshPendingTransferNotices } from "@/domains/transfer/lib/pending-transfer-notices/pending-transfer-notices";
import {
  clearPendingTransfer,
  PendingTransferStage,
  updatePendingTransfer,
} from "@/domains/transfer/lib/pending-transfers/pending-transfers";
import {
  isSessionEndFailure,
  TransportError,
  TransportErrorKind,
} from "@/shared/http/transport-error/transport-error";
import { type QueryClient } from "@tanstack/react-query";

export const UNSETTLED_TRANSFER_READ_INTERVAL_MS = 15_000;

export enum TransferReadFailure {
  NotFound = "not_found",
  BankUnreached = "bank_unreached",
  Unexpected = "unexpected",
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
      await recordPendingTransferAnswer(
        customerId,
        transferId,
        outcome,
        transfer.reference,
      );
    return outcome;
  } catch (error) {
    if (classifyTransferReadFailure(error) === TransferReadFailure.NotFound)
      await clearPendingTransfer(customerId, transferId);
  }
}

// Unlike checkPendingTransferOnce, a settled outcome clears the record, unless kept for Home to announce.
export async function settlePendingTransfer({
  queryClient,
  customerId,
  transferId,
  outcome,
  reference,
  keepSettled = false,
}: {
  queryClient: QueryClient;
  customerId: string;
  transferId: string;
  outcome?: ReturnType<typeof outcomeOfTransfer>;
  reference?: string;
  keepSettled?: boolean;
}) {
  if (isSettledTransferOutcome(outcome) && !keepSettled)
    await clearPendingTransfer(customerId, transferId);
  else
    await recordPendingTransferAnswer(
      customerId,
      transferId,
      outcome,
      reference,
    );
  await refreshPendingTransferNotices(queryClient, customerId);
}

export function classifyTransferReadFailure(error: unknown) {
  if (error === null || error === undefined) return undefined;
  if (!(error instanceof TransportError)) return TransferReadFailure.Unexpected;
  if (error.code === GetTransferErrorCode.TransferNotFound)
    return TransferReadFailure.NotFound;
  // None of these is the bank answering about the transfer.
  return isSessionEndFailure(error) ||
    error.kind === TransportErrorKind.Network ||
    error.kind === TransportErrorKind.Timeout ||
    error.kind === TransportErrorKind.Aborted ||
    (error.kind === TransportErrorKind.Http && (error.status ?? 0) >= 500)
    ? TransferReadFailure.BankUnreached
    : TransferReadFailure.Unexpected;
}

function recordPendingTransferAnswer(
  customerId: string,
  transferId: string,
  outcome: ReturnType<typeof outcomeOfTransfer> | undefined,
  reference: string | undefined,
) {
  return updatePendingTransfer(customerId, transferId, {
    ...(reference !== undefined && { reference }),
    // An outcome named means the bank holds the approval, so the next launch warns on Home rather than reopening Result.
    ...(outcome !== undefined &&
      outcome !== null && { stage: PendingTransferStage.Processing }),
  });
}
