import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

import { reduceAmountAndNoteEvent } from "./amount-and-note-events";
import { reduceApprovalEvent } from "./approval-events";
import { reduceRecipientEvent } from "./recipient-events";
import { reduceReviewAndCreateEvent } from "./review-and-create-events";
import {
  type TransferFlowAction,
  TransferFlowActionType,
  type TransferFlowState,
  TransferFlowStep,
} from "./transfer-flow.type";
import { trackTransferStepOrScenarioChange } from "./transfer-funnel";

export {
  ApprovalPath,
  TransferFlowActionType,
  TransferFlowStep,
  TransferHoldKind,
} from "./transfer-flow.type";

const STARTING_FLOW: TransferFlowState = {
  step: TransferFlowStep.Editing,
  draft: {},
};

// Outside React, so the deep-link handler can read it before any screen mounts.
export const transferFlowStore = createStore<TransferFlowState>()(
  () => STARTING_FLOW,
);

export function dispatchTransferFlow(
  action: TransferFlowAction,
  { reported = true } = {},
) {
  const flow = transferFlowStore.getState();
  const nextFlow = reduceTransferFlow(flow, action);
  if (nextFlow === flow) return false;
  transferFlowStore.setState(nextFlow, true);
  if (reported) trackTransferStepOrScenarioChange(flow, nextFlow);
  return true;
}

export function useTransferFlow<Selected>(
  select: (flow: TransferFlowState) => Selected,
) {
  return useStore(transferFlowStore, select);
}

export function isTransferDraftOpen(flow: TransferFlowState) {
  return "draft" in flow && flow.draft.recipient !== undefined;
}

// Done too: review stays drawn until the result page covers it, and must not offer to send again meanwhile.
export function isTransferSentOrBeingSent(flow: TransferFlowState) {
  return (
    flow.step === TransferFlowStep.Creating ||
    flow.step === TransferFlowStep.Approving ||
    flow.step === TransferFlowStep.Submitting ||
    flow.step === TransferFlowStep.Done
  );
}

function reduceTransferFlow(
  flow: TransferFlowState,
  action: TransferFlowAction,
): TransferFlowState {
  switch (action.type) {
    case TransferFlowActionType.RecipientChosen:
      return reduceRecipientEvent(flow, action);
    case TransferFlowActionType.AmountEntered:
      return reduceAmountAndNoteEvent(flow, action);
    case TransferFlowActionType.Confirmed:
    case TransferFlowActionType.Created:
    case TransferFlowActionType.CreateNotSent:
    case TransferFlowActionType.CreateUnanswered:
    case TransferFlowActionType.CreateRefusedByHold:
    case TransferFlowActionType.CreateReturnedToAmount:
      return reduceReviewAndCreateEvent(flow, action);
    case TransferFlowActionType.ApprovalPathChosen:
    case TransferFlowActionType.ApprovalSent:
    case TransferFlowActionType.ApprovalAttemptRefused:
    case TransferFlowActionType.ApprovalNotSent:
    case TransferFlowActionType.ApproveRefusedByHold:
    case TransferFlowActionType.ApprovalAnswered:
    case TransferFlowActionType.AnswerLost:
      return reduceApprovalEvent(flow, action);
    case TransferFlowActionType.FlowLeft:
      // An approval that left the phone may have moved money, so its record outlives the screens.
      return flow.step === TransferFlowStep.Submitting ? flow : STARTING_FLOW;
  }
}
