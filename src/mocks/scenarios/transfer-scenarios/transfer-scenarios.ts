import { http } from "msw";
import type { RequestHandler } from "msw";

import { GetTransferLimitsErrorCode } from "@/domains/account/api/get-transfer-limits/get-transfer-limits.type";
import {
  CoolingOffReason,
  CreateTransferErrorCode,
} from "@/domains/transfer/api/create-transfer/create-transfer.type";
import { GetTransferErrorCode } from "@/domains/transfer/api/get-transfer/get-transfer.type";
import { LookupRecipientErrorCode } from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import type { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import {
  ApprovalOutcome,
  type BankConditions,
} from "@/mocks/bank/conditions/conditions";
import { BANK_PATHS } from "@/mocks/handlers/bank-paths/bank-paths";
import { isAmountStepOpen } from "@/mocks/scenarios/amount-step-open/amount-step-open";

import {
  commitThenAnswer,
  errorAnswer,
  lostAnswer,
  maintenanceAnswer,
  serverErrorAnswer,
  unknownCodeAnswer,
} from "@/mocks/scenarios/overlay-answers/overlay-answers";

export enum TransferStep {
  Start = "Start",
  Recipient = "Recipient",
  Amount = "Amount",
  Review = "Review",
  Approval = "Approval",
  Outcome = "Outcome",
  Recovery = "Recovery",
}

// eslint-disable-next-line fe/file-layout -- read at load by TRANSFER_SCENARIOS
const MINUTE_MS = 60_000;
// eslint-disable-next-line fe/file-layout -- read at load by TRANSFER_SCENARIOS
const HOUR_MS = 60 * MINUTE_MS;

export const TRANSFER_SCENARIOS = {
  "transfer.balance_and_limit_shown": { step: TransferStep.Start },
  "transfer.new_customer_daily_limit": {
    step: TransferStep.Start,
    conditions: { dailyLimitMinor: 100_000 },
  },
  "transfer.balance_unavailable": {
    step: TransferStep.Start,
    handlers: () => [
      http.get(BANK_PATHS.primaryAccount, serverErrorAnswer),
      http.get(BANK_PATHS.transferLimits, serverErrorAnswer),
    ],
  },
  "transfer.under_maintenance": {
    step: TransferStep.Start,
    handlers: () => [
      http.get(
        BANK_PATHS.transferLimits,
        maintenanceAnswer(GetTransferLimitsErrorCode),
      ),
      http.post(
        BANK_PATHS.transfers,
        maintenanceAnswer(CreateTransferErrorCode),
      ),
    ],
  },
  "transfer.offline": {
    step: TransferStep.Start,
    handlers: () => [http.all("*", lostAnswer)],
  },
  "transfer.earlier_transfer_unconfirmed": { step: TransferStep.Start },
  "transfer.screen_capture_blocked": {
    step: TransferStep.Start,
    phoneSide: true,
  },
  "transfer.start_unexpected": {
    step: TransferStep.Start,
    handlers: () => [http.get(BANK_PATHS.primaryAccount, unknownCodeAnswer)],
  },

  "transfer.badly_formed_input": { step: TransferStep.Recipient },
  "transfer.contacts_access_refused": { step: TransferStep.Recipient },
  "transfer.contact_without_mobile": { step: TransferStep.Recipient },
  "transfer.recent_recipient_chosen": { step: TransferStep.Recipient },
  "transfer.recipient_unexpected": {
    step: TransferStep.Recipient,
    handlers: () => [http.get(BANK_PATHS.recentRecipients, unknownCodeAnswer)],
  },

  "transfer.amount_too_high": { step: TransferStep.Amount },
  "transfer.amount_unexpected": {
    step: TransferStep.Amount,
    handlers: () => [
      http.get(BANK_PATHS.transferLimits, () =>
        isAmountStepOpen() ? unknownCodeAnswer() : undefined,
      ),
    ],
  },

  "transfer.recipient_found": { step: TransferStep.Review },
  "transfer.first_transfer_to_recipient": { step: TransferStep.Review },
  "transfer.recipient_not_found": {
    step: TransferStep.Review,
    handlers: () => [
      http.post(
        BANK_PATHS.recipientLookup,
        errorAnswer(
          404,
          LookupRecipientErrorCode.RecipientNotFound,
          "No DuitNow account is registered to this id.",
        ),
      ),
    ],
  },
  "transfer.name_check_unavailable": {
    step: TransferStep.Review,
    handlers: () => [
      http.post(
        BANK_PATHS.recipientLookup,
        errorAnswer(
          503,
          LookupRecipientErrorCode.NameEnquiryUnavailable,
          "Name enquiry is unavailable.",
        ),
      ),
    ],
  },
  "transfer.too_many_name_checks": {
    step: TransferStep.Review,
    handlers: () => [
      http.post(
        BANK_PATHS.recipientLookup,
        errorAnswer(
          429,
          LookupRecipientErrorCode.TooManyLookups,
          "Too many name checks in a short time.",
        ),
      ),
    ],
  },
  "transfer.balance_or_limit_short_at_confirmation": {
    step: TransferStep.Review,
    handlers: () => [
      http.post(
        BANK_PATHS.transfers,
        errorAnswer(
          422,
          CreateTransferErrorCode.InsufficientFunds,
          "The balance is lower than the amount.",
        ),
      ),
    ],
  },
  "transfer.cooling_off_new_phone": {
    step: TransferStep.Review,
    conditions: {
      coolingOff: {
        reason: CoolingOffReason.DevicePaired,
        endsAfterActivationMs: 11 * HOUR_MS,
      },
    },
  },
  "transfer.cooling_off_new_account": {
    step: TransferStep.Review,
    conditions: {
      coolingOff: {
        reason: CoolingOffReason.NewAccount,
        endsAfterActivationMs: 45 * MINUTE_MS,
      },
    },
  },
  "transfer.account_locked": {
    step: TransferStep.Review,
    conditions: { accountLocked: true },
  },
  "transfer.name_check_expired": {
    step: TransferStep.Review,
    handlers: () => [
      http.post(
        BANK_PATHS.transfers,
        errorAnswer(
          422,
          CreateTransferErrorCode.RecipientRefExpired,
          "The recipient check has expired: look the recipient up again.",
        ),
      ),
    ],
  },
  "transfer.confirmation_unanswered": {
    step: TransferStep.Review,
    handlers: (bankHandlers) => [
      commitThenAnswer(BANK_PATHS.transfers, bankHandlers, lostAnswer),
    ],
  },
  "transfer.details_changed_after_no_answer": { step: TransferStep.Review },
  "transfer.double_tap_ignored": { step: TransferStep.Review },
  "transfer.review_unexpected": {
    step: TransferStep.Review,
    handlers: () => [http.post(BANK_PATHS.transfers, unknownCodeAnswer)],
  },

  "transfer.biometrics_recognised": { step: TransferStep.Approval },
  "transfer.approval_cancelled": { step: TransferStep.Approval },
  "transfer.biometrics_not_recognised": { step: TransferStep.Approval },
  "transfer.biometrics_locked_out": { step: TransferStep.Approval },
  "transfer.biometrics_unavailable": { step: TransferStep.Approval },
  "transfer.biometrics_changed": { step: TransferStep.Approval },
  "transfer.pin_chosen": { step: TransferStep.Approval },
  "transfer.pin_incorrect": { step: TransferStep.Approval },
  "transfer.pin_locked": { step: TransferStep.Approval },
  "transfer.approval_key_unknown": {
    step: TransferStep.Approval,
    conditions: { keysBeforeActivationUnknown: true },
  },
  // A late arrival rather than a zero-length window: the phone is still told 60 seconds, and
  // sends the approval that draws the bank's refusal.
  "transfer.approval_expired": {
    step: TransferStep.Approval,
    conditions: { approvalsArriveLate: true },
  },
  "transfer.approval_not_verified": {
    step: TransferStep.Approval,
    conditions: { signaturesRejected: true },
  },
  "transfer.balance_or_limit_short_at_approval": {
    step: TransferStep.Approval,
    conditions: { approvalOutcome: ApprovalOutcome.ShortAtApproval },
  },
  "transfer.fraud_blocked": {
    step: TransferStep.Approval,
    conditions: { approvalOutcome: ApprovalOutcome.FraudBlocked },
  },
  "transfer.held_for_review": {
    step: TransferStep.Approval,
    conditions: { approvalOutcome: ApprovalOutcome.HeldForReview },
  },
  "transfer.recipient_account_inactive": {
    step: TransferStep.Approval,
    conditions: { approvalOutcome: ApprovalOutcome.RecipientAccountInactive },
  },
  "transfer.rooted_phone": { step: TransferStep.Approval, phoneSide: true },
  "transfer.approval_unexpected": { step: TransferStep.Approval },

  "transfer.completed": { step: TransferStep.Outcome },
  "transfer.processing": {
    step: TransferStep.Outcome,
    conditions: { approvalOutcome: ApprovalOutcome.Processing },
  },
  "transfer.refunded_after_processing": {
    step: TransferStep.Outcome,
    conditions: { approvalOutcome: ApprovalOutcome.RefundedAfterProcessing },
  },
  "transfer.outcome_unexpected": {
    step: TransferStep.Outcome,
    // Approved as processing, so Result reads it again: a completed approval would outlast the failed read.
    conditions: { approvalOutcome: ApprovalOutcome.Processing },
    handlers: () => [http.get(BANK_PATHS.transfer, unknownCodeAnswer)],
  },

  "transfer.approval_unanswered": {
    step: TransferStep.Recovery,
    handlers: (bankHandlers) => [
      commitThenAnswer(BANK_PATHS.transferApproval, bankHandlers, lostAnswer),
    ],
  },
  "transfer.status_unreachable": {
    step: TransferStep.Recovery,
    handlers: (bankHandlers) => [
      commitThenAnswer(BANK_PATHS.transferApproval, bankHandlers, lostAnswer),
      http.get(BANK_PATHS.transfer, lostAnswer),
    ],
  },
  "transfer.app_closed_during_approval": { step: TransferStep.Recovery },
  "transfer.last_transfer_not_found": {
    step: TransferStep.Recovery,
    handlers: (bankHandlers) => [
      commitThenAnswer(BANK_PATHS.transferApproval, bankHandlers, lostAnswer),
      http.get(
        BANK_PATHS.transfer,
        errorAnswer(
          404,
          GetTransferErrorCode.TransferNotFound,
          "No transfer has this id.",
        ),
      ),
    ],
  },
  "transfer.session_ended": {
    step: TransferStep.Recovery,
    handlers: () => [
      http.all(
        "*",
        errorAnswer(401, "SESSION_ENDED", "The session has ended."),
      ),
    ],
  },
  "transfer.approval_unknown_answer": {
    step: TransferStep.Recovery,
    handlers: (bankHandlers) => [
      commitThenAnswer(
        BANK_PATHS.transferApproval,
        bankHandlers,
        unknownCodeAnswer,
      ),
    ],
  },
  "transfer.recovery_unexpected": {
    step: TransferStep.Recovery,
    handlers: (bankHandlers) => [
      commitThenAnswer(BANK_PATHS.transferApproval, bankHandlers, lostAnswer),
      http.get(BANK_PATHS.transfer, unknownCodeAnswer),
    ],
  },
} satisfies Record<`${TransferScenarioId}`, TransferScenario>;

export interface TransferScenario {
  step: TransferStep;
  // Read by the bank itself: what it decides goes here, never into an overlay.
  conditions?: BankConditions;
  // Given the bank's own handlers, so an overlay can let a write commit and then lose its answer.
  handlers?: (bankHandlers: RequestHandler[]) => RequestHandler[];
  // Lists the pick right after No biometrics, which is phone-side too but listed by hand: flagging it lists it twice.
  phoneSide?: true;
}
