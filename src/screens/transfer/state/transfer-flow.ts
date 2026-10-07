import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

import type { RecipientIdType } from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";

export enum TransferFlowStep {
  Editing = "editing",
}

export enum TransferFlowActionType {
  RecipientChosen = "recipient_chosen",
  FlowLeft = "flow_left",
}

const STARTING_FLOW: TransferFlowState = { step: TransferFlowStep.Editing };

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
  return flow.recipient !== undefined;
}

function reduceTransferFlow(
  flow: TransferFlowState,
  action: TransferFlowAction,
): TransferFlowState {
  switch (action.type) {
    case TransferFlowActionType.RecipientChosen:
      return { ...flow, recipient: action.recipient };
    case TransferFlowActionType.FlowLeft:
      return STARTING_FLOW;
  }
}

type TransferRecipient = { idType: RecipientIdType.Mobile; idValue: string };

type TransferFlowState = {
  step: TransferFlowStep.Editing;
  recipient?: TransferRecipient;
};

type TransferFlowAction =
  | {
      type: TransferFlowActionType.RecipientChosen;
      recipient: TransferRecipient;
    }
  | { type: TransferFlowActionType.FlowLeft };
