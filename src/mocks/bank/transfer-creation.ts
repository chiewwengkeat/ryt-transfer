import {
  CreateTransferErrorCode,
  type CreateTransferErrorResponse,
  type CreateTransferRequest,
  type CreateTransferResponse,
} from "@/domains/transfer/api/create-transfer/create-transfer.type";
import {
  TransferDirection,
  TransferFunds,
  TransferStatus,
  type Transfer,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";

import {
  lockOrCoolingOffRefusal,
  PER_TRANSFER_MAX_MINOR,
  transferLimitsAt,
} from "./account";
import { bankError, type BankAnswer } from "./answers";
import { toMalaysiaIso } from "./malaysia-time";
import { bankPorts, randomHex } from "./ports";
import { bankState } from "./state";

const APPROVAL_WINDOW_SECONDS = 60;
// No wider: DuitNow carries the note onto the recipient's statement as it is.
const NOTE_PATTERN = /^[A-Za-z0-9 ]{0,30}$/;

export function createBankTransfer({
  body,
  nowMs,
}: {
  body: Record<string, unknown>;
  nowMs: number;
}): BankAnswer<CreateTransferResponse | CreateTransferErrorResponse> {
  const { recipientRef, amount, note } = body as Partial<CreateTransferRequest>;
  if (
    typeof recipientRef !== "string" ||
    typeof amount !== "object" ||
    amount === null ||
    (note !== undefined && typeof note !== "string")
  ) {
    return bankError(
      400,
      CreateTransferErrorCode.InvalidRequest,
      "Send a recipientRef, an amount and an optional note.",
    );
  }
  const held = lockOrCoolingOffRefusal(nowMs, CreateTransferErrorCode);
  if (held) return held;
  const state = bankState();
  const nameCheck = Object.hasOwn(state.recipientRefs, recipientRef)
    ? state.recipientRefs[recipientRef]
    : undefined;
  if (!nameCheck || nameCheck.expiresAtMs <= nowMs) {
    return bankError(
      422,
      CreateTransferErrorCode.RecipientRefExpired,
      "The recipient check has expired: look the recipient up again.",
    );
  }
  if (
    !Number.isSafeInteger(amount.minor) ||
    amount.minor <= 0 ||
    amount.currency !== "MYR"
  ) {
    return bankError(
      422,
      CreateTransferErrorCode.AmountInvalid,
      "The amount must be a whole number of sen above zero, in MYR.",
    );
  }
  if (note !== undefined && !NOTE_PATTERN.test(note)) {
    return bankError(
      422,
      CreateTransferErrorCode.NoteInvalid,
      "A note holds up to 30 letters, digits and spaces.",
    );
  }
  if (amount.minor > PER_TRANSFER_MAX_MINOR) {
    return bankError(
      422,
      CreateTransferErrorCode.AbovePerTransferMax,
      "The amount is above the per-transfer maximum.",
    );
  }
  if (amount.minor > state.balanceMinor) {
    return bankError(
      422,
      CreateTransferErrorCode.InsufficientFunds,
      "The balance is lower than the amount.",
    );
  }
  if (amount.minor > transferLimitsAt(nowMs).remainingMinor) {
    return bankError(
      422,
      CreateTransferErrorCode.DailyLimitExceeded,
      "The amount is above what today's limit leaves.",
    );
  }

  const transferId = `trf_${randomHex(8)}`;
  const challenge = btoa(
    String.fromCharCode(...bankPorts().randomBytes(16)),
  ).replace(/=+$/, "");
  const { recipient } = nameCheck;
  const transfer: Transfer = {
    transferId,
    version: 1,
    direction: TransferDirection.Out,
    status: TransferStatus.AwaitingApproval,
    funds: TransferFunds.NotDebited,
    counterparty: {
      registeredName: recipient.registeredName,
      idType: recipient.idType,
      idValueMasked: recipient.idValueMasked,
      bankName: recipient.bankName,
    },
    amount: { minor: amount.minor, currency: "MYR" },
    ...(note && { note }),
    createdAt: toMalaysiaIso(nowMs),
    updatedAt: toMalaysiaIso(nowMs),
  };
  state.transfers.push({
    transfer,
    createdAtMs: nowMs,
    counterpartyId: nameCheck.counterpartyId,
    approval: {
      challenge,
      expiresAtMs: nowMs + APPROVAL_WINDOW_SECONDS * 1000,
      // Kept from create, so a name check that expires mid-approval cannot fail an honest one.
      signedDetails: {
        transferId,
        challenge,
        recipientRef,
        registeredName: recipient.registeredName,
        idValueMasked: recipient.idValueMasked,
        bankCode: recipient.bankCode,
        amount: transfer.amount,
        note: note ?? null,
      },
    },
  });
  return {
    status: 201,
    body: {
      transfer,
      approval: { challenge, expiresInSeconds: APPROVAL_WINDOW_SECONDS },
    },
  };
}
