import {
  type AmountAndNoteEvent,
  type TransferFlowState,
  TransferFlowStep,
} from "./transfer-flow.type";

export function reduceAmountAndNoteEvent(
  flow: TransferFlowState,
  action: AmountAndNoteEvent,
): TransferFlowState {
  if (
    flow.step !== TransferFlowStep.Editing &&
    flow.step !== TransferFlowStep.Reviewing
  )
    return flow;
  const { recipient } = flow.draft;
  if (recipient === undefined) return flow;
  return {
    step: TransferFlowStep.Reviewing,
    draft: {
      recipient,
      amount: action.amount,
      ...(action.note !== undefined && { note: action.note }),
    },
  };
}
