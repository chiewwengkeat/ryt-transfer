import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

import type {
  LookupRecipientResponse,
  RecipientIdType,
} from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import type { Money } from "@/shared/lib/money/money.type";
import { trackEvent } from "@/shared/observability/observability";

export enum TransferFlowStep {
  Editing = "editing",
  Reviewing = "reviewing",
  Creating = "creating",
  Approving = "approving",
  Submitting = "submitting",
  Done = "done",
}

export enum TransferFlowActionType {
  RecipientChosen = "recipient_chosen",
  AmountEntered = "amount_entered",
  Confirmed = "confirmed",
  Created = "created",
  ApprovalSent = "approval_sent",
  NotSent = "not_sent",
  Completed = "completed",
  FlowLeft = "flow_left",
}

const STARTING_FLOW: TransferFlowState = {
  step: TransferFlowStep.Editing,
  draft: {},
};

// Outside React, so the deep-link handler can read it before any screen mounts.
export const transferFlowStore = createStore<TransferFlowState>()(
  () => STARTING_FLOW,
);

export function dispatchTransferFlow(action: TransferFlowAction) {
  const flow = transferFlowStore.getState();
  const nextFlow = reduceTransferFlow(flow, action);
  if (nextFlow === flow) return false;
  transferFlowStore.setState(nextFlow, true);
  if (nextFlow.step !== flow.step)
    trackEvent("transfer_step", {
      step: nextFlow.step,
      ...("draft" in nextFlow && {
        amountMinor: nextFlow.draft.amount?.minor,
        currency: nextFlow.draft.amount?.currency,
      }),
    });
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

function reduceTransferFlow(
  flow: TransferFlowState,
  action: TransferFlowAction,
): TransferFlowState {
  switch (action.type) {
    case TransferFlowActionType.RecipientChosen:
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
    case TransferFlowActionType.AmountEntered: {
      if (
        flow.step !== TransferFlowStep.Editing &&
        flow.step !== TransferFlowStep.Reviewing
      )
        return flow;
      const { recipient } = flow.draft;
      if (recipient === undefined) return flow;
      return {
        step: TransferFlowStep.Reviewing,
        draft: { recipient, amount: action.amount },
      };
    }
    // Only from review, so a second tap on Transfer while the first is under way starts nothing.
    case TransferFlowActionType.Confirmed:
      if (flow.step !== TransferFlowStep.Reviewing) return flow;
      return {
        step: TransferFlowStep.Creating,
        draft: flow.draft,
        lookup: action.lookup,
        idempotencyKey: action.idempotencyKey,
      };
    case TransferFlowActionType.Created:
      if (flow.step !== TransferFlowStep.Creating) return flow;
      return {
        step: TransferFlowStep.Approving,
        draft: flow.draft,
        lookup: flow.lookup,
        transferId: action.transferId,
        challenge: action.challenge,
      };
    case TransferFlowActionType.ApprovalSent:
      if (flow.step !== TransferFlowStep.Approving) return flow;
      return {
        step: TransferFlowStep.Submitting,
        draft: flow.draft,
        transferId: flow.transferId,
        attemptKey: action.attemptKey,
      };
    case TransferFlowActionType.NotSent:
      if (
        flow.step !== TransferFlowStep.Creating &&
        flow.step !== TransferFlowStep.Approving &&
        flow.step !== TransferFlowStep.Submitting
      )
        return flow;
      return { step: TransferFlowStep.Reviewing, draft: flow.draft };
    case TransferFlowActionType.Completed:
      if (flow.step !== TransferFlowStep.Submitting) return flow;
      return { step: TransferFlowStep.Done, transferId: flow.transferId };
    case TransferFlowActionType.FlowLeft:
      // An approval that left the phone may have moved money, so its record outlives the screens.
      return flow.step === TransferFlowStep.Submitting ? flow : STARTING_FLOW;
  }
}

type TransferRecipient = { idType: RecipientIdType.Mobile; idValue: string };

type TransferDraft = { recipient: TransferRecipient; amount: Money };

type TransferFlowState =
  | { step: TransferFlowStep.Editing; draft: Partial<TransferDraft> }
  | { step: TransferFlowStep.Reviewing; draft: TransferDraft }
  | {
      step: TransferFlowStep.Creating;
      draft: TransferDraft;
      lookup: LookupRecipientResponse;
      idempotencyKey: string;
    }
  | {
      step: TransferFlowStep.Approving;
      draft: TransferDraft;
      lookup: LookupRecipientResponse;
      transferId: string;
      challenge: string;
    }
  | {
      step: TransferFlowStep.Submitting;
      draft: TransferDraft;
      transferId: string;
      attemptKey: string;
    }
  | { step: TransferFlowStep.Done; transferId: string };

type TransferFlowAction =
  | {
      type: TransferFlowActionType.RecipientChosen;
      recipient: TransferRecipient;
    }
  | { type: TransferFlowActionType.AmountEntered; amount: Money }
  | {
      type: TransferFlowActionType.Confirmed;
      lookup: LookupRecipientResponse;
      idempotencyKey: string;
    }
  | {
      type: TransferFlowActionType.Created;
      transferId: string;
      challenge: string;
    }
  | { type: TransferFlowActionType.ApprovalSent; attemptKey: string }
  | { type: TransferFlowActionType.NotSent }
  | { type: TransferFlowActionType.Completed }
  | { type: TransferFlowActionType.FlowLeft };
