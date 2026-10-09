import type { WireMoney } from "@/shared/lib/money/money";

import type { RecipientIdType } from "../lookup-recipient/lookup-recipient.type";

export enum TransferDirection {
  Out = "OUT",
  In = "IN",
}

export enum TransferStatus {
  AwaitingApproval = "AWAITING_APPROVAL",
  Processing = "PROCESSING",
  Completed = "COMPLETED",
  Unsuccessful = "UNSUCCESSFUL",
  Expired = "EXPIRED",
}

export enum TransferFunds {
  NotDebited = "NOT_DEBITED",
  Debited = "DEBITED",
  RefundPending = "REFUND_PENDING",
  Refunded = "REFUNDED",
  Credited = "CREDITED",
}

export enum TransferFailureReason {
  InsufficientFunds = "INSUFFICIENT_FUNDS",
  DailyLimitExceeded = "DAILY_LIMIT_EXCEEDED",
  FraudBlocked = "FRAUD_BLOCKED",
  RecipientAccountInactive = "RECIPIENT_ACCOUNT_INACTIVE",
  RecipientBankRejected = "RECIPIENT_BANK_REJECTED",
}

export interface Transfer {
  transferId: string;
  // Rises on every change at the bank: never let an older copy replace a newer one.
  version: number;
  direction: TransferDirection;
  status: TransferStatus;
  // Whether money moved; Unsuccessful alone does not say, so outcome copy keys on this.
  funds: TransferFunds;
  underReview?: boolean;
  // A snapshot taken when it was sent: the recipient going out, the sender coming in.
  counterparty: {
    registeredName: string;
    idType: RecipientIdType;
    idValueMasked: string;
    bankName: string;
  };
  amount: WireMoney;
  note?: string;
  reference?: string;
  // Both instants are ISO 8601 at Malaysia's +08:00 offset.
  createdAt: string;
  updatedAt: string;
  failureReason?: TransferFailureReason;
}

export interface GetTransferResponse {
  transfer: Transfer;
}

export enum GetTransferErrorCode {
  TransferNotFound = "TRANSFER_NOT_FOUND",
}

export interface GetTransferErrorResponse {
  error: { code: GetTransferErrorCode; message: string };
}
