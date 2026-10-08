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
  const { recipient } = flow.draft;
  const recipientChanged =
    recipient?.idType !== action.recipient.idType ||
    recipient.idValue !== action.recipient.idValue ||
    recipient.bankCode !== action.recipient.bankCode ||
    recipient.recentId !== action.recipient.recentId;
  return {
    step: TransferFlowStep.Editing,
    draft: { ...flow.draft, recipient: action.recipient },
    ...(((flow.step === TransferFlowStep.Reviewing &&
      flow.createKeyToReuse !== undefined &&
      recipientChanged) ||
      (flow.step === TransferFlowStep.Editing &&
        flow.detailsChangedAfterNoAnswer)) && {
      detailsChangedAfterNoAnswer: true,
    }),
  };
}
