import {
  TransferFailureReason,
  TransferFunds,
  TransferStatus,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import { toMalaysiaIso } from "@/mocks/bank/malaysia-time/malaysia-time";
import {
  bankState,
  notifyCustomer,
  type BankTransferRecord,
} from "@/mocks/bank/state/state";

export const SETTLES_AFTER_MS = 20_000;

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

export function notifyTransferSent(record: BankTransferRecord, atMs: number) {
  const { amount, counterparty, reference } = record.transfer;
  notifyCustomer(
    atMs,
    `You sent ${(amount.minor / 100).toFixed(2)} MYR to ${counterparty.registeredName}. Reference ${reference}.`,
  );
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
      switch (change) {
        case PendingTransferChange.Complete:
          record.transfer = { ...changed, status: TransferStatus.Completed };
          delete record.transfer.underReview;
          notifyTransferSent(record, atMs);
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
            `Your transfer to ${changed.counterparty.registeredName} did not go through and was refunded. Reference ${changed.reference}.`,
          );
          break;
      }
    }
  }
}

const REFUND_PENDING_MS = 10_000;
