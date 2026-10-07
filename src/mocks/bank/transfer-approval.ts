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
import { ApprovalOutcome } from "@/mocks/scenarios/transfer-scenarios";

import { transferLimitsAt } from "./account";
import { refusalOfDemoPin } from "./approval-keys";
import { bankError, type BankAnswer } from "./answers";
import { malaysianDate, toMalaysiaIso } from "./malaysia-time";
import { randomHex } from "./ports";
import {
  expireTransfer,
  notifyTransferSent,
  PendingTransferChange,
  SETTLES_AFTER_MS,
} from "./settlement";
import { activeBankConditions, bankState, notifyCustomer } from "./state";
import { verifyApprovalSignature } from "./verification";

export function approveBankTransfer(
  transferId: string,
  { body, nowMs }: { body: Record<string, unknown>; nowMs: number },
): BankAnswer {
  const state = bankState();
  const conditions = activeBankConditions();
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
  if (record.approval && conditions.approvalsArriveLate) {
    expireTransfer(record, nowMs);
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
  const key = state.approvalKeys.find(
    (candidate) =>
      candidate.keyId === keyId &&
      !(
        conditions.keysBeforeActivationUnknown &&
        candidate.registeredAtMs < conditions.activatedAtMs
      ),
  );
  if (!key) {
    return bankError(
      409,
      ApproveTransferErrorCode.KeyNotRegistered,
      "No approval key with this id is registered.",
    );
  }
  const verified =
    !conditions.signaturesRejected &&
    verifyApprovalSignature({
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
  const executed = {
    ...record.transfer,
    version: record.transfer.version + 1,
    reference: `${malaysianDate(nowMs).replace(/-/g, "")}${randomHex(4).toUpperCase()}`,
    updatedAt: toMalaysiaIso(nowMs),
  };
  const endUnsuccessful = (failureReason: TransferFailureReason) => {
    record.transfer = {
      ...executed,
      status: TransferStatus.Unsuccessful,
      failureReason,
    };
  };
  const debitAndHold = (change: PendingTransferChange, underReview = false) => {
    state.balanceMinor -= amountMinor;
    record.transfer = {
      ...executed,
      status: TransferStatus.Processing,
      funds: TransferFunds.Debited,
      ...(underReview && { underReview }),
    };
    record.pendingChange = { atMs: nowMs + SETTLES_AFTER_MS, change };
  };

  if (amountMinor > state.balanceMinor) {
    endUnsuccessful(TransferFailureReason.InsufficientFunds);
  } else if (amountMinor > transferLimitsAt(nowMs).remainingMinor) {
    endUnsuccessful(TransferFailureReason.DailyLimitExceeded);
  } else {
    switch (conditions.approvalOutcome) {
      case ApprovalOutcome.ShortAtApproval:
        endUnsuccessful(TransferFailureReason.InsufficientFunds);
        break;
      case ApprovalOutcome.FraudBlocked:
        endUnsuccessful(TransferFailureReason.FraudBlocked);
        notifyCustomer(
          nowMs,
          `We stopped your transfer to ${executed.counterparty.registeredName} to protect your account. We will contact you about it.`,
        );
        break;
      case ApprovalOutcome.RecipientAccountInactive:
        endUnsuccessful(TransferFailureReason.RecipientAccountInactive);
        break;
      case ApprovalOutcome.HeldForReview:
        debitAndHold(PendingTransferChange.Complete, true);
        break;
      case ApprovalOutcome.Processing:
        debitAndHold(PendingTransferChange.Complete);
        break;
      case ApprovalOutcome.RefundedAfterProcessing:
        debitAndHold(PendingTransferChange.FailForRefund);
        break;
      case undefined:
        state.balanceMinor -= amountMinor;
        record.transfer = {
          ...executed,
          status: TransferStatus.Completed,
          funds: TransferFunds.Debited,
        };
        notifyTransferSent(record, nowMs);
        break;
    }
  }
  return { status: 200, body: { transfer: record.transfer } };
}
