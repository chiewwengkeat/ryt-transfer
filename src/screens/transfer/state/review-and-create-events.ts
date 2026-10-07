import {
  ApprovalPath,
  type ReviewAndCreateEvent,
  TransferFlowActionType,
  type TransferFlowState,
  TransferFlowStep,
} from "./transfer-flow.type";

export function reduceReviewAndCreateEvent(
  flow: TransferFlowState,
  action: ReviewAndCreateEvent,
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
    return { ...flow, notice: action.notice };
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
      };
    case TransferFlowActionType.CreateUnanswered:
      return {
        step: TransferFlowStep.Reviewing,
        draft: flow.draft,
        notice: action.notice,
        createKeyToReuse: flow.idempotencyKey,
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
      };
  }
}
