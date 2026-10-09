import type {
  CoolingOffReason,
  CreateTransferErrorCode,
} from "@/domains/transfer/api/create-transfer/create-transfer.type";
import type {
  LookupRecipientRequest,
  LookupRecipientResponse,
  RecipientIdType,
} from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import type { Money } from "@/shared/lib/money/money.type";

export enum TransferFlowStep {
  Editing = "editing",
  Reviewing = "reviewing",
  Creating = "creating",
  Approving = "approving",
  Submitting = "submitting",
  Done = "done",
}

export enum TransferFlowActionType {
  RecipientChosen = "recipient_chosen",
  AmountEntered = "amount_entered",
  Confirmed = "confirmed",
  Created = "created",
  CreateNotSent = "create_not_sent",
  CreateUnanswered = "create_unanswered",
  CreateRefusedByHold = "create_refused_by_hold",
  CreateReturnedToAmount = "create_returned_to_amount",
  ApprovalPathChosen = "approval_path_chosen",
  ApprovalSent = "approval_sent",
  ApprovalAttemptRefused = "approval_attempt_refused",
  ApprovalNotSent = "approval_not_sent",
  ApproveRefusedByHold = "approve_refused_by_hold",
  ApprovalAnswered = "approval_answered",
  AnswerLost = "answer_lost",
  FlowLeft = "flow_left",
}

export enum ApprovalPath {
  Biometric = "biometric",
  Pin = "pin",
}

export enum TransferHoldKind {
  AccountLocked = "account_locked",
  CoolingOff = "cooling_off",
}

// App code may not import the registry's id type, so these restate its ids; a test holds them to it.
export enum TransferFlowScenario {
  UnderMaintenance = "transfer.under_maintenance",
  Offline = "transfer.offline",
  BadlyFormedInput = "transfer.badly_formed_input",
  ContactsAccessRefused = "transfer.contacts_access_refused",
  ContactWithoutMobile = "transfer.contact_without_mobile",
  RecentRecipientChosen = "transfer.recent_recipient_chosen",
  RecipientUnexpected = "transfer.recipient_unexpected",
  AmountTooHigh = "transfer.amount_too_high",
  RecipientFound = "transfer.recipient_found",
  FirstTransferToRecipient = "transfer.first_transfer_to_recipient",
  RecipientNotFound = "transfer.recipient_not_found",
  NameCheckUnavailable = "transfer.name_check_unavailable",
  TooManyNameChecks = "transfer.too_many_name_checks",
  BalanceOrLimitShortAtConfirmation = "transfer.balance_or_limit_short_at_confirmation",
  CoolingOffNewPhone = "transfer.cooling_off_new_phone",
  CoolingOffNewAccount = "transfer.cooling_off_new_account",
  AccountLocked = "transfer.account_locked",
  NameCheckExpired = "transfer.name_check_expired",
  ConfirmationUnanswered = "transfer.confirmation_unanswered",
  DetailsChangedAfterNoAnswer = "transfer.details_changed_after_no_answer",
  ReviewUnexpected = "transfer.review_unexpected",
  BiometricsRecognised = "transfer.biometrics_recognised",
  ApprovalCancelled = "transfer.approval_cancelled",
  BiometricsNotRecognised = "transfer.biometrics_not_recognised",
  BiometricsLockedOut = "transfer.biometrics_locked_out",
  BiometricsUnavailable = "transfer.biometrics_unavailable",
  BiometricsChanged = "transfer.biometrics_changed",
  PinChosen = "transfer.pin_chosen",
  PinIncorrect = "transfer.pin_incorrect",
  PinLocked = "transfer.pin_locked",
  ApprovalKeyUnknown = "transfer.approval_key_unknown",
  ApprovalExpired = "transfer.approval_expired",
  ApprovalNotVerified = "transfer.approval_not_verified",
  BalanceOrLimitShortAtApproval = "transfer.balance_or_limit_short_at_approval",
  RootedPhone = "transfer.rooted_phone",
  ApprovalUnexpected = "transfer.approval_unexpected",
  SessionEnded = "transfer.session_ended",
}

export type TransferFlowNotice = Extract<
  TransferFlowScenario,
  | TransferFlowScenario.UnderMaintenance
  | TransferFlowScenario.BadlyFormedInput
  | TransferFlowScenario.BalanceOrLimitShortAtConfirmation
  | TransferFlowScenario.NameCheckExpired
  | TransferFlowScenario.ConfirmationUnanswered
  | TransferFlowScenario.DetailsChangedAfterNoAnswer
  | TransferFlowScenario.ReviewUnexpected
  | TransferFlowScenario.ApprovalCancelled
  | TransferFlowScenario.BiometricsNotRecognised
  | TransferFlowScenario.BiometricsLockedOut
  | TransferFlowScenario.BiometricsUnavailable
  | TransferFlowScenario.BiometricsChanged
  | TransferFlowScenario.PinLocked
  | TransferFlowScenario.ApprovalKeyUnknown
  | TransferFlowScenario.ApprovalExpired
  | TransferFlowScenario.ApprovalNotVerified
  | TransferFlowScenario.BalanceOrLimitShortAtApproval
  | TransferFlowScenario.RootedPhone
  | TransferFlowScenario.ApprovalUnexpected
>;

export type TransferRecipient = Extract<
  LookupRecipientRequest,
  { idType: RecipientIdType }
> & { recentId?: string };

export type TransferDraft = {
  recipient: TransferRecipient;
  amount: Money;
  note?: string;
};

export type TransferHold =
  | { kind: TransferHoldKind.AccountLocked }
  | {
      kind: TransferHoldKind.CoolingOff;
      // Absent when the bank's time is unreadable or already past: it still refused, so the hold stays, untimed.
      until?: string;
      reason: CoolingOffReason;
    };

export type TransferNoticeDetail = {
  until?: string;
  code?: CreateTransferErrorCode;
};

export type TransferFlowState =
  | {
      step: TransferFlowStep.Editing;
      draft: Partial<TransferDraft>;
      notice?: TransferFlowNotice;
      noticeDetail?: TransferNoticeDetail;
      // Not a notice: the amount step would show it, and the matrix shows it on review only.
      detailsChangedAfterNoAnswer?: true;
    }
  | {
      step: TransferFlowStep.Reviewing;
      draft: TransferDraft;
      notice?: TransferFlowNotice;
      noticeDetail?: TransferNoticeDetail;
      hold?: TransferHold;
      // A create whose answer never arrived may have run, so the next Confirm repeats it under the same key.
      createKeyToReuse?: string;
      createRecipientRefToReuse?: string;
    }
  | {
      step: TransferFlowStep.Creating;
      draft: TransferDraft;
      lookup: LookupRecipientResponse;
      idempotencyKey: string;
    }
  | ({ step: TransferFlowStep.Approving } & ApprovalInProgress)
  | ({
      step: TransferFlowStep.Submitting;
      attemptKey: string;
    } & ApprovalInProgress)
  | { step: TransferFlowStep.Done; transferId: string };

export type RecipientEvent = {
  type: TransferFlowActionType.RecipientChosen;
  recipient: TransferRecipient;
};

export type AmountAndNoteEvent = {
  type: TransferFlowActionType.AmountEntered;
  amount: Money;
  note?: string;
};

export type ReviewAndCreateEvent =
  | {
      type: TransferFlowActionType.Confirmed;
      lookup: LookupRecipientResponse;
      idempotencyKey: string;
    }
  | {
      type: TransferFlowActionType.Created;
      transferId: string;
      challenge: string;
      expiresInSeconds: number;
    }
  | {
      type: TransferFlowActionType.CreateNotSent;
      notice?: TransferFlowNotice;
      noticeDetail?: TransferNoticeDetail;
    }
  | {
      type: TransferFlowActionType.CreateUnanswered;
      notice: TransferFlowNotice;
    }
  | { type: TransferFlowActionType.CreateRefusedByHold; hold: TransferHold }
  | {
      type: TransferFlowActionType.CreateReturnedToAmount;
      notice: TransferFlowNotice;
      noticeDetail?: TransferNoticeDetail;
    };

export type ApprovalEvent =
  | { type: TransferFlowActionType.ApprovalPathChosen; path: ApprovalPath }
  | { type: TransferFlowActionType.ApprovalSent; attemptKey: string }
  | { type: TransferFlowActionType.ApprovalAttemptRefused }
  | {
      type: TransferFlowActionType.ApprovalNotSent;
      notice: TransferFlowNotice;
    }
  | { type: TransferFlowActionType.ApproveRefusedByHold; hold: TransferHold }
  | { type: TransferFlowActionType.ApprovalAnswered }
  | { type: TransferFlowActionType.AnswerLost };

export type TransferFlowAction =
  | RecipientEvent
  | AmountAndNoteEvent
  | ReviewAndCreateEvent
  | ApprovalEvent
  | { type: TransferFlowActionType.FlowLeft };

type ApprovalInProgress = {
  draft: TransferDraft;
  lookup: LookupRecipientResponse;
  transferId: string;
  challenge: string;
  expiresInSeconds: number;
  path: ApprovalPath;
};
