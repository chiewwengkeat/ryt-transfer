import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  isUnansweredWriteFailure,
  TransportError,
  TransportErrorKind,
} from "@/shared/http/transport-error/transport-error";
import { requestJson } from "@/shared/http/transport/transport";
import type { WireMoney } from "@/shared/lib/money/money";

import { getTransferOptions } from "@/domains/transfer/api/get-transfer/get-transfer";
import {
  PendingTransferStage,
  writePendingTransfer,
} from "@/domains/transfer/lib/pending-transfers/pending-transfers";
import type {
  ApproveTransferErrorResponse,
  ApproveTransferRequest,
  ApproveTransferResponse,
} from "./approve-transfer.type";

export class ApproveRequestNotSentError extends Error {}

export function readApproveTransferRefusal(failure: unknown) {
  return failure instanceof TransportError &&
    failure.kind === TransportErrorKind.Http
    ? (failure.body as ApproveTransferErrorResponse | undefined)?.error
    : undefined;
}

export function useApproveTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    // The variables carry the PIN on that path, so a finished call is dropped once its caller resets it.
    gcTime: 0,
    mutationFn: async ({
      customerId,
      transferId,
      request,
      idempotencyKey,
    }: {
      customerId: string;
      transferId: string;
      request: ApproveTransferRequest;
      idempotencyKey: string;
    }) => {
      // Awaited before the call: an approval the bank may act on must be one the next launch can find.
      await writePendingTransfer(customerId, {
        transferId,
        idempotencyKey,
        createdAt: new Date().toISOString(),
        stage: PendingTransferStage.Approving,
      }).catch((cause: unknown) => {
        throw new ApproveRequestNotSentError(
          "The approval's pending record could not be written.",
          { cause },
        );
      });
      const sendApproveRequest = () =>
        requestJson<ApproveTransferResponse>(
          `/transfers/${encodeURIComponent(transferId)}/approve`,
          {
            method: "POST",
            body: request,
            idempotencyKey,
            timeoutMs: 30_000,
          },
        );
      // Asked again as the same signed bytes under the same key, which the bank acts on at most once.
      for (const resendDelayMs of [2_000, 4_000]) {
        try {
          return await sendApproveRequest();
        } catch (failure) {
          if (!isUnansweredWriteFailure(failure)) throw failure;
        }
        await new Promise((resolve) => {
          setTimeout(resolve, resendDelayMs);
        });
      }
      return await sendApproveRequest();
    },
    onSuccess: ({ transfer }) => {
      queryClient.setQueryData(
        getTransferOptions(transfer.transferId).queryKey,
        (held) =>
          held !== undefined && held.version >= transfer.version
            ? held
            : transfer,
      );
    },
  });
}

export function buildSignedApprovalText(details: {
  transferId: string;
  challenge: string;
  recipientRef: string;
  registeredName: string;
  idValueMasked: string;
  bankCode: string;
  amount: WireMoney;
  note?: string | null;
}) {
  // The key order is the signed format: change it only together with the format tag.
  return JSON.stringify({
    format: "transfer-approval/1",
    transferId: details.transferId,
    challenge: details.challenge,
    recipientRef: details.recipientRef,
    registeredName: details.registeredName,
    idValueMasked: details.idValueMasked,
    bankCode: details.bankCode,
    amountMinor: details.amount.minor,
    currency: details.amount.currency,
    note: details.note || null, // ||, not ??: an empty note signs as no note
  });
}
