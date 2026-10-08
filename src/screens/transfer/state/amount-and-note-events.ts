import {
  type AmountAndNoteEvent,
  TransferFlowScenario,
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
  // Never the unanswered create's key, even for the same details: review asks the name check afresh when it
  // reopens, so the repeat would not match the request that key first went with.
  return {
    step: TransferFlowStep.Reviewing,
    draft: {
      recipient,
      amount: action.amount,
      ...(action.note !== undefined && { note: action.note }),
    },
    ...(flow.step === TransferFlowStep.Reviewing &&
      flow.createKeyToReuse !== undefined &&
      (action.amount.minor !== flow.draft.amount.minor ||
        action.note !== flow.draft.note) && {
        notice: TransferFlowScenario.DetailsChangedAfterNoAnswer,
      }),
  };
}
