import type {
  CoolingOffReason,
  CreateTransferErrorCode,
} from "@/domains/transfer/api/create-transfer/create-transfer.type";
import type {
  LookupRecipientRequest,
  LookupRecipientResponse,
  RecipientIdType,
} from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import type { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import type { Money } from "@/shared/lib/money/money";

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
  ApprovalRefusedByHold = "approval_refused_by_hold",
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

export type TransferFlowNotice = Extract<
  TransferScenarioId,
  | TransferScenarioId.UnderMaintenance
  | TransferScenarioId.BadlyFormedInput
  | TransferScenarioId.BalanceOrLimitShortAtConfirmation
  | TransferScenarioId.NameCheckExpired
  | TransferScenarioId.ConfirmationUnanswered
  | TransferScenarioId.DetailsChangedAfterNoAnswer
  | TransferScenarioId.ReviewUnexpected
  | TransferScenarioId.ApprovalCancelled
  | TransferScenarioId.BiometricsNotRecognised
  | TransferScenarioId.BiometricsLockedOut
  | TransferScenarioId.BiometricsUnavailable
  | TransferScenarioId.BiometricsChanged
  | TransferScenarioId.PinLocked
  | TransferScenarioId.ApprovalKeyUnknown
  | TransferScenarioId.ApprovalExpired
  | TransferScenarioId.ApprovalNotVerified
  | TransferScenarioId.BalanceOrLimitShortAtApproval
  | TransferScenarioId.RootedPhone
  | TransferScenarioId.ApprovalUnexpected
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

export type RecipientAction = {
  type: TransferFlowActionType.RecipientChosen;
  recipient: TransferRecipient;
};

export type AmountAndNoteAction = {
  type: TransferFlowActionType.AmountEntered;
  amount: Money;
  note?: string;
};

export type ReviewAndCreateAction =
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

export type ApprovalAction =
  | { type: TransferFlowActionType.ApprovalPathChosen; path: ApprovalPath }
  | { type: TransferFlowActionType.ApprovalSent; attemptKey: string }
  | { type: TransferFlowActionType.ApprovalAttemptRefused }
  | {
      type: TransferFlowActionType.ApprovalNotSent;
      notice: TransferFlowNotice;
    }
  | { type: TransferFlowActionType.ApprovalRefusedByHold; hold: TransferHold }
  | { type: TransferFlowActionType.ApprovalAnswered }
  | { type: TransferFlowActionType.AnswerLost };

export type TransferFlowAction =
  | RecipientAction
  | AmountAndNoteAction
  | ReviewAndCreateAction
  | ApprovalAction
  | { type: TransferFlowActionType.FlowLeft };

type ApprovalInProgress = {
  draft: TransferDraft;
  lookup: LookupRecipientResponse;
  transferId: string;
  challenge: string;
  expiresInSeconds: number;
  path: ApprovalPath;
};
