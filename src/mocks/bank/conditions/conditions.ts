import type { CoolingOffReason } from "@/domains/transfer/api/create-transfer/create-transfer.type";

export enum ApprovalOutcome {
  ShortAtApproval = "SHORT_AT_APPROVAL",
  FraudBlocked = "FRAUD_BLOCKED",
  HeldForReview = "HELD_FOR_REVIEW",
  RecipientAccountInactive = "RECIPIENT_ACCOUNT_INACTIVE",
  Processing = "PROCESSING",
  RefundedAfterProcessing = "REFUNDED_AFTER_PROCESSING",
}

export interface BankConditions {
  dailyLimitMinor?: number;
  coolingOff?: { reason: CoolingOffReason; endsAfterActivationMs: number };
  accountLocked?: boolean;
  keysBeforeActivationUnknown?: boolean;
  approvalsArriveLate?: boolean;
  signaturesRejected?: boolean;
  approvalOutcome?: ApprovalOutcome;
}
