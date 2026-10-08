import { useMutation, useQueryClient } from "@tanstack/react-query";

import { requestJson } from "@/shared/http/transport";
import type { WireMoney } from "@/shared/lib/money/money.type";

import {
  PendingTransferStage,
  writePendingTransfer,
} from "../../hooks/pending-transfers";
import { getTransferOptions } from "../get-transfer/get-transfer";
import {
  ApproveTransferErrorCode,
  type ApproveTransferRequest,
  type ApproveTransferResponse,
} from "./approve-transfer.type";

// Only answers proving the bank refused and moved no money: any other failure may hide a debit, so never "not sent".
export const APPROVAL_REFUSAL_CODES = new Set<string>([
  ApproveTransferErrorCode.ApprovalExpired,
  ApproveTransferErrorCode.ApprovalInvalid,
  ApproveTransferErrorCode.PinIncorrect,
  ApproveTransferErrorCode.PinLocked,
  ApproveTransferErrorCode.KeyNotRegistered,
  ApproveTransferErrorCode.CoolingOff,
  ApproveTransferErrorCode.AccountLocked,
  ApproveTransferErrorCode.InvalidRequest,
]);

export class ApproveRequestNotSentError extends Error {}

export function useApproveTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
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
