import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

import { CoolingOffReason } from "@/domains/transfer/api/create-transfer/create-transfer.type";
import { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import { trackEvent } from "@/shared/observability/observability/observability";

import {
  reduceAmountAndNoteAction,
  reduceApprovalAction,
  reduceRecipientAction,
  reduceReviewAndCreateAction,
} from "./flow-store.reduce";
import {
  type TransferFlowAction,
  TransferFlowActionType,
  type TransferFlowState,
  TransferFlowStep,
  TransferHoldKind,
} from "./flow-store.type";

export {
  ApprovalPath,
  TransferFlowActionType,
  TransferFlowStep,
  TransferHoldKind,
} from "./flow-store.type";

// eslint-disable-next-line fe/file-layout -- read at load by transferFlowStore
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

export function isFlowNoLongerOnTransfer(
  flow: TransferFlowState,
  transferId: string,
) {
  return !("transferId" in flow) || flow.transferId !== transferId;
}

export function holdTransferScenarioReports() {
  scenarioReportsHeld = true;
}

// Reports the held scenario only if the flow still shows it; with no flow, as the root goes away, nothing shows.
export function releaseTransferScenarioReports(
  flowShownNow?: TransferFlowState,
) {
  const flowReached = flowReachedWhileReportsHeld;
  scenarioReportsHeld = false;
  flowReachedWhileReportsHeld = undefined;
  if (flowReached !== undefined && flowReached === flowShownNow)
    trackTransferStep(flowReached, findScenarioTheFlowShows(flowReached));
}

let scenarioReportsHeld = false;
let flowReachedWhileReportsHeld: TransferFlowState | undefined;

function trackTransferStepOrScenarioChange(
  flow: TransferFlowState,
  nextFlow: TransferFlowState,
) {
  const scenario = findScenarioTheFlowShows(nextFlow);
  if (
    nextFlow.step === flow.step &&
    (scenario === undefined || scenario === findScenarioTheFlowShows(flow))
  )
    return;
  if (scenarioReportsHeld && scenario !== undefined) {
    flowReachedWhileReportsHeld = nextFlow;
    return;
  }
  trackTransferStep(nextFlow, scenario);
}

function trackTransferStep(
  flow: TransferFlowState,
  scenario: TransferScenarioId | undefined,
) {
  trackEvent("transfer_step", {
    step: flow.step,
    ...("draft" in flow && {
      amountMinor: flow.draft.amount?.minor,
      currency: flow.draft.amount?.currency,
    }),
    ...("path" in flow && { path: flow.path }),
    scenario,
  });
}

function findScenarioTheFlowShows(flow: TransferFlowState) {
  if ("notice" in flow && flow.notice !== undefined) return flow.notice;
  if (!("hold" in flow) || flow.hold === undefined) return undefined;
  if (flow.hold.kind === TransferHoldKind.AccountLocked)
    return TransferScenarioId.AccountLocked;
  return flow.hold.reason === CoolingOffReason.NewAccount
    ? TransferScenarioId.CoolingOffNewAccount
    : TransferScenarioId.CoolingOffNewPhone;
}

function reduceTransferFlow(
  flow: TransferFlowState,
  action: TransferFlowAction,
): TransferFlowState {
  switch (action.type) {
    case TransferFlowActionType.RecipientChosen:
      return reduceRecipientAction(flow, action);
    case TransferFlowActionType.AmountEntered:
      return reduceAmountAndNoteAction(flow, action);
    case TransferFlowActionType.Confirmed:
    case TransferFlowActionType.Created:
    case TransferFlowActionType.CreateNotSent:
    case TransferFlowActionType.CreateUnanswered:
    case TransferFlowActionType.CreateRefusedByHold:
    case TransferFlowActionType.CreateReturnedToAmount:
      return reduceReviewAndCreateAction(flow, action);
    case TransferFlowActionType.ApprovalPathChosen:
    case TransferFlowActionType.ApprovalSent:
    case TransferFlowActionType.ApprovalAttemptRefused:
    case TransferFlowActionType.ApprovalNotSent:
    case TransferFlowActionType.ApprovalRefusedByHold:
    case TransferFlowActionType.ApprovalAnswered:
    case TransferFlowActionType.AnswerLost:
      return reduceApprovalAction(flow, action);
    case TransferFlowActionType.FlowLeft:
      // An approval that left the phone may have moved money, so its record outlives the screens.
      return flow.step === TransferFlowStep.Submitting ? flow : STARTING_FLOW;
  }
}
