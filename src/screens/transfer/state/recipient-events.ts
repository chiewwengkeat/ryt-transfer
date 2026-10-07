import {
  type RecipientEvent,
  type TransferFlowState,
  TransferFlowStep,
} from "./transfer-flow.type";

export function reduceRecipientEvent(
  flow: TransferFlowState,
  action: RecipientEvent,
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
  return {
    step: TransferFlowStep.Editing,
    draft: { ...flow.draft, recipient: action.recipient },
  };
}
