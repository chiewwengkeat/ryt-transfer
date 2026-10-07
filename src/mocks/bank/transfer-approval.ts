import { buildSignedApprovalText } from "@/domains/transfer/api/approve-transfer/approve-transfer";
import {
  ApproveTransferErrorCode,
  type ApproveTransferRequest,
} from "@/domains/transfer/api/approve-transfer/approve-transfer.type";
import {
  TransferFailureReason,
  TransferFunds,
  TransferStatus,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";

import { transferLimitsAt } from "./account";
import { refusalOfDemoPin } from "./approval-keys";
import { bankError, type BankAnswer } from "./answers";
import { malaysianDate, toMalaysiaIso } from "./malaysia-time";
import { randomHex } from "./ports";
import { bankState, notifyCustomer } from "./state";
import { verifyApprovalSignature } from "./verification";

export function approveBankTransfer(
  transferId: string,
  { body, nowMs }: { body: Record<string, unknown>; nowMs: number },
): BankAnswer {
  const state = bankState();
  const record = state.transfers.find(
    ({ transfer }) => transfer.transferId === transferId,
  );
  if (!record) {
    return bankError(
      404,
      ApproveTransferErrorCode.TransferNotFound,
      "No transfer has this id.",
    );
  }
  if (record.transfer.status === TransferStatus.Expired) {
    return bankError(
      410,
      ApproveTransferErrorCode.ApprovalExpired,
      "The approval window has passed.",
    );
  }
  // A transfer executes at most once: any later approval reads where it ended up.
  if (!record.approval) {
    return { status: 200, body: { transfer: record.transfer } };
  }

  const { keyId, signature, pin } = body as Partial<ApproveTransferRequest>;
  if (
    typeof keyId !== "string" ||
    typeof signature !== "string" ||
    (pin !== undefined && typeof pin !== "string")
  ) {
    return bankError(
      400,
      ApproveTransferErrorCode.InvalidRequest,
      "Send a keyId, a signature and, for the possession key, a pin.",
    );
  }
  const key = state.approvalKeys.find((candidate) => candidate.keyId === keyId);
  if (!key) {
    return bankError(
      409,
      ApproveTransferErrorCode.KeyNotRegistered,
      "No approval key with this id is registered.",
    );
  }
  const verified = verifyApprovalSignature({
    signedText: buildSignedApprovalText(record.approval.signedDetails),
    signatureBase64: signature,
    publicKeySpkiBase64: key.spkiBase64,
  });
  if (!verified) {
    return bankError(
      403,
      ApproveTransferErrorCode.ApprovalInvalid,
      "The signature does not match this transfer.",
    );
  }
  if (key.kind === "possession") {
    if (pin === undefined) {
      return bankError(
        400,
        ApproveTransferErrorCode.InvalidRequest,
        "Approving with the possession key needs the PIN.",
      );
    }
    const refusal = refusalOfDemoPin(pin);
    if (refusal) return refusal;
  }

  delete record.approval;
  const amountMinor = record.transfer.amount.minor;
  const shortfall =
    amountMinor > state.balanceMinor
      ? TransferFailureReason.InsufficientFunds
      : amountMinor > transferLimitsAt(nowMs).remainingMinor
        ? TransferFailureReason.DailyLimitExceeded
        : undefined;
  const executed = {
    ...record.transfer,
    version: record.transfer.version + 1,
    reference: `${malaysianDate(nowMs).replace(/-/g, "")}${randomHex(4).toUpperCase()}`,
    updatedAt: toMalaysiaIso(nowMs),
  };
  if (shortfall) {
    record.transfer = {
      ...executed,
      status: TransferStatus.Unsuccessful,
      failureReason: shortfall,
    };
  } else {
    state.balanceMinor -= amountMinor;
    record.transfer = {
      ...executed,
      status: TransferStatus.Completed,
      funds: TransferFunds.Debited,
    };
    notifyCustomer(
      nowMs,
      `You sent ${(amountMinor / 100).toFixed(2)} MYR to ${executed.counterparty.registeredName}. Reference ${executed.reference}.`,
    );
  }
  return { status: 200, body: { transfer: record.transfer } };
}
