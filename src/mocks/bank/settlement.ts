import {
  TransferFailureReason,
  TransferFunds,
  TransferStatus,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";

import { toMalaysiaIso } from "./malaysia-time";
import { bankState, notifyCustomer, type BankTransferRecord } from "./state";

const REFUND_PENDING_MS = 10_000;

export enum PendingTransferChange {
  Complete = "COMPLETE",
  FailForRefund = "FAIL_FOR_REFUND",
  Refund = "REFUND",
}

export function expireTransfer(record: BankTransferRecord, atMs: number) {
  delete record.approval;
  record.transfer = {
    ...record.transfer,
    status: TransferStatus.Expired,
    version: record.transfer.version + 1,
    updatedAt: toMalaysiaIso(atMs),
  };
}

// Runs before every operation, so expiry and settlement land in the same synchronous step as
// whatever the request then does: an approval can never race its own expiry.
export function advanceBankTransfers(nowMs: number) {
  const state = bankState();
  for (const record of state.transfers) {
    if (record.approval && record.approval.expiresAtMs <= nowMs) {
      expireTransfer(record, record.approval.expiresAtMs);
    }
    while (record.pendingChange && record.pendingChange.atMs <= nowMs) {
      const { atMs, change } = record.pendingChange;
      delete record.pendingChange;
      const changed = {
        ...record.transfer,
        version: record.transfer.version + 1,
        updatedAt: toMalaysiaIso(atMs),
      };
      const { registeredName } = changed.counterparty;
      switch (change) {
        case PendingTransferChange.Complete:
          record.transfer = { ...changed, status: TransferStatus.Completed };
          delete record.transfer.underReview;
          notifyCustomer(
            atMs,
            `Your transfer to ${registeredName} is complete. Reference ${changed.reference}.`,
          );
          break;
        case PendingTransferChange.FailForRefund:
          record.transfer = {
            ...changed,
            status: TransferStatus.Unsuccessful,
            funds: TransferFunds.RefundPending,
            failureReason: TransferFailureReason.RecipientBankRejected,
          };
          record.pendingChange = {
            atMs: atMs + REFUND_PENDING_MS,
            change: PendingTransferChange.Refund,
          };
          break;
        case PendingTransferChange.Refund:
          state.balanceMinor += changed.amount.minor;
          record.transfer = { ...changed, funds: TransferFunds.Refunded };
          notifyCustomer(
            atMs,
            `Your transfer to ${registeredName} did not go through and was refunded. Reference ${changed.reference}.`,
          );
          break;
      }
    }
  }
}
