import { useMutation, useQueryClient } from "@tanstack/react-query";

import { requestJson } from "@/shared/http/transport";
import type { WireMoney } from "@/shared/lib/money/money.type";

import {
  PendingTransferStage,
  writePendingTransfer,
} from "../../hooks/pending-transfers";
import { getTransferOptions } from "../get-transfer/get-transfer";
import type {
  ApproveTransferRequest,
  ApproveTransferResponse,
} from "./approve-transfer.type";

export class ApproveRequestNotSentError extends Error {}

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
      return await requestJson<ApproveTransferResponse>(
        `/transfers/${encodeURIComponent(transferId)}/approve`,
        {
          method: "POST",
          body: request,
          idempotencyKey,
          timeoutMs: 30_000,
        },
      );
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
    note: details.note || null, // an empty note signs as no note
  });
}
