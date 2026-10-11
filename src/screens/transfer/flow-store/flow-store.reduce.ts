import { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import {
  type AmountAndNoteAction,
  type ApprovalAction,
  ApprovalPath,
  type RecipientAction,
  type ReviewAndCreateAction,
  TransferFlowActionType,
  type TransferFlowState,
  TransferFlowStep,
} from "./flow-store.type";

export function reduceRecipientAction(
  flow: TransferFlowState,
  action: RecipientAction,
): TransferFlowState {
  // Review offers no way back while submitting, so this is a new transfer after leaving an unconfirmed one.
  if (flow.step === TransferFlowStep.Submitting)
    return {
      step: TransferFlowStep.Editing,
      draft: { recipient: action.recipient },
    };
  if (
    flow.step !== TransferFlowStep.Editing &&
    flow.step !== TransferFlowStep.Reviewing
  )
    return flow;
  const { recipient } = flow.draft;
  const hasRecipientChanged =
    recipient?.idType !== action.recipient.idType ||
    recipient.idValue !== action.recipient.idValue ||
    recipient.bankCode !== action.recipient.bankCode ||
    recipient.recentId !== action.recipient.recentId;
  return {
    step: TransferFlowStep.Editing,
    draft: { ...flow.draft, recipient: action.recipient },
    ...(((flow.step === TransferFlowStep.Reviewing &&
      flow.createKeyToReuse !== undefined &&
      hasRecipientChanged) ||
      (flow.step === TransferFlowStep.Editing &&
        flow.detailsChangedAfterNoAnswer)) && {
      detailsChangedAfterNoAnswer: true,
    }),
  };
}

export function reduceAmountAndNoteAction(
  flow: TransferFlowState,
  action: AmountAndNoteAction,
): TransferFlowState {
  if (
    flow.step !== TransferFlowStep.Editing &&
    flow.step !== TransferFlowStep.Reviewing
  )
    return flow;
  const { recipient } = flow.draft;
  if (recipient === undefined) return flow;
  // Never the unanswered create's key, even for the same details: review asks the name check afresh when it
  // reopens, so the repeat would not match the request that key first went with.
  return {
    step: TransferFlowStep.Reviewing,
    draft: {
      recipient,
      amount: action.amount,
      ...(action.note !== undefined && { note: action.note }),
    },
    ...(((flow.step === TransferFlowStep.Editing &&
      flow.detailsChangedAfterNoAnswer) ||
      (flow.step === TransferFlowStep.Reviewing &&
        flow.createKeyToReuse !== undefined &&
        (action.amount.minor !== flow.draft.amount.minor ||
          action.note !== flow.draft.note))) && {
      notice: TransferScenarioId.DetailsChangedAfterNoAnswer,
    }),
  };
}

export function reduceReviewAndCreateAction(
  flow: TransferFlowState,
  action: ReviewAndCreateAction,
): TransferFlowState {
  if (action.type === TransferFlowActionType.Confirmed)
    // Only from review, so a second tap on Transfer while the first is under way starts nothing.
    return flow.step === TransferFlowStep.Reviewing
      ? {
          step: TransferFlowStep.Creating,
          draft: flow.draft,
          lookup: action.lookup,
          idempotencyKey: action.idempotencyKey,
        }
      : flow;
  if (
    action.type === TransferFlowActionType.CreateNotSent &&
    flow.step === TransferFlowStep.Reviewing
  )
    // Nothing left the phone, so review keeps a lost create's key and any hold: a spread, never a rebuild.
    return {
      ...flow,
      notice: action.notice,
      noticeDetail: action.noticeDetail,
    };
  if (flow.step !== TransferFlowStep.Creating) return flow;
  switch (action.type) {
    case TransferFlowActionType.Created:
      return {
        step: TransferFlowStep.Approving,
        draft: flow.draft,
        lookup: flow.lookup,
        transferId: action.transferId,
        challenge: action.challenge,
        expiresInSeconds: action.expiresInSeconds,
        path: ApprovalPath.Biometric,
      };
    case TransferFlowActionType.CreateNotSent:
      return {
        step: TransferFlowStep.Reviewing,
        draft: flow.draft,
        notice: action.notice,
        noticeDetail: action.noticeDetail,
      };
    case TransferFlowActionType.CreateUnanswered:
      return {
        step: TransferFlowStep.Reviewing,
        draft: flow.draft,
        notice: action.notice,
        createKeyToReuse: flow.idempotencyKey,
        createRecipientRefToReuse: flow.lookup.recipientRef,
      };
    case TransferFlowActionType.CreateRefusedByHold:
      return {
        step: TransferFlowStep.Reviewing,
        draft: flow.draft,
        hold: action.hold,
      };
    case TransferFlowActionType.CreateReturnedToAmount:
      return {
        step: TransferFlowStep.Editing,
        draft: flow.draft,
        notice: action.notice,
        noticeDetail: action.noticeDetail,
      };
  }
}

export function reduceApprovalAction(
  flow: TransferFlowState,
  action: ApprovalAction,
): TransferFlowState {
  switch (action.type) {
    case TransferFlowActionType.ApprovalPathChosen:
      if (flow.step !== TransferFlowStep.Approving) return flow;
      return { ...flow, path: action.path };
    case TransferFlowActionType.ApprovalSent:
      if (flow.step !== TransferFlowStep.Approving) return flow;
      return {
        ...flow,
        step: TransferFlowStep.Submitting,
        attemptKey: action.attemptKey,
      };
    case TransferFlowActionType.ApprovalAttemptRefused:
      if (flow.step !== TransferFlowStep.Submitting) return flow;
      return {
        step: TransferFlowStep.Approving,
        draft: flow.draft,
        lookup: flow.lookup,
        transferId: flow.transferId,
        challenge: flow.challenge,
        expiresInSeconds: flow.expiresInSeconds,
        path: flow.path,
      };
    // Back to review drops the transfer: the next Confirm creates a new one under a fresh key.
    case TransferFlowActionType.ApprovalNotSent:
      if (
        flow.step !== TransferFlowStep.Approving &&
        flow.step !== TransferFlowStep.Submitting
      )
        return flow;
      return {
        step: TransferFlowStep.Reviewing,
        draft: flow.draft,
        notice: action.notice,
      };
    case TransferFlowActionType.ApprovalRefusedByHold:
      if (
        flow.step !== TransferFlowStep.Approving &&
        flow.step !== TransferFlowStep.Submitting
      )
        return flow;
      return {
        step: TransferFlowStep.Reviewing,
        draft: flow.draft,
        hold: action.hold,
      };
    case TransferFlowActionType.ApprovalAnswered:
    case TransferFlowActionType.AnswerLost:
      if (flow.step !== TransferFlowStep.Submitting) return flow;
      return { step: TransferFlowStep.Done, transferId: flow.transferId };
  }
}
