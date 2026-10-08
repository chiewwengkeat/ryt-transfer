import {
  type ApprovalEvent,
  TransferFlowActionType,
  type TransferFlowState,
  TransferFlowStep,
} from "./transfer-flow.type";

export function reduceApprovalEvent(
  flow: TransferFlowState,
  action: ApprovalEvent,
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
    case TransferFlowActionType.ApproveRefusedByHold:
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
    case TransferFlowActionType.ApprovalReturnedToAmount:
      if (flow.step !== TransferFlowStep.Submitting) return flow;
      return {
        step: TransferFlowStep.Editing,
        draft: flow.draft,
        notice: action.notice,
      };
    case TransferFlowActionType.ApprovalAnswered:
    case TransferFlowActionType.AnswerLost:
      if (flow.step !== TransferFlowStep.Submitting) return flow;
      return { step: TransferFlowStep.Done, transferId: flow.transferId };
  }
}

export function isFlowOnAnotherTransfer(
  flow: TransferFlowState,
  transferId: string,
) {
  return "transferId" in flow && flow.transferId !== transferId;
}
