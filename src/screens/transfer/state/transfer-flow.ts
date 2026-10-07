import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

import type { RecipientIdType } from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import type { Money } from "@/shared/lib/money/money.type";

export enum TransferFlowStep {
  Editing = "editing",
  Reviewing = "reviewing",
}

export enum TransferFlowActionType {
  RecipientChosen = "recipient_chosen",
  AmountEntered = "amount_entered",
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
  transferFlowStore.setState(
    reduceTransferFlow(transferFlowStore.getState(), action),
    true,
  );
}

export function useTransferFlow<Selected>(
  select: (flow: TransferFlowState) => Selected,
) {
  return useStore(transferFlowStore, select);
}

export function isTransferDraftOpen(flow: TransferFlowState) {
  return flow.draft.recipient !== undefined;
}

function reduceTransferFlow(
  flow: TransferFlowState,
  action: TransferFlowAction,
): TransferFlowState {
  switch (action.type) {
    case TransferFlowActionType.RecipientChosen:
      return {
        step: TransferFlowStep.Editing,
        draft: { ...flow.draft, recipient: action.recipient },
      };
    case TransferFlowActionType.AmountEntered: {
      const { recipient } = flow.draft;
      if (recipient === undefined) return flow;
      return {
        step: TransferFlowStep.Reviewing,
        draft: { recipient, amount: action.amount },
      };
    }
    case TransferFlowActionType.FlowLeft:
      return STARTING_FLOW;
  }
}

type TransferRecipient = { idType: RecipientIdType.Mobile; idValue: string };

type TransferDraft = { recipient: TransferRecipient; amount: Money };

type TransferFlowState =
  | { step: TransferFlowStep.Editing; draft: Partial<TransferDraft> }
  | { step: TransferFlowStep.Reviewing; draft: TransferDraft };

type TransferFlowAction =
  | {
      type: TransferFlowActionType.RecipientChosen;
      recipient: TransferRecipient;
    }
  | { type: TransferFlowActionType.AmountEntered; amount: Money }
  | { type: TransferFlowActionType.FlowLeft };
