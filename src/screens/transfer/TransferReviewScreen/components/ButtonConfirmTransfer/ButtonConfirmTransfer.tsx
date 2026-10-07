import { useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import { useCreateTransfer } from "@/domains/transfer/api/create-transfer/create-transfer";
import { useLookupRecipient } from "@/domains/transfer/api/lookup-recipient/lookup-recipient";
import { refreshAccountAndHistoryAfterApproval } from "@/screens/transfer/state/refresh-after-approval";
import {
  dispatchTransferFlow,
  TransferFlowActionType,
  TransferFlowScenario,
  TransferFlowStep,
  transferFlowStore,
  useTransferFlow,
} from "@/screens/transfer/state/transfer-flow";
import type { TransferDraft } from "@/screens/transfer/state/transfer-flow.type";
import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";

import { useSendTransferApproval } from "./hooks/use-send-transfer-approval";

interface Props {
  draft: TransferDraft;
}
export default function ButtonConfirmTransfer({ draft }: Props) {
  const { t } = useTranslation("transfer");
  const queryClient = useQueryClient();
  const lookup = useLookupRecipient(draft.recipient);
  const createTransfer = useCreateTransfer();
  const sendTransferApproval = useSendTransferApproval();
  const sending = useTransferFlow(
    (flow) =>
      flow.step === TransferFlowStep.Creating ||
      flow.step === TransferFlowStep.Approving ||
      flow.step === TransferFlowStep.Submitting,
  );
  const confirmedLookup = lookup.data;
  if (confirmedLookup === undefined) return null;

  const createAndApproveTransfer = async () => {
    const reviewing = transferFlowStore.getState();
    const idempotencyKey =
      (reviewing.step === TransferFlowStep.Reviewing &&
        reviewing.createKeyToReuse) ||
      randomUUID();
    if (
      !dispatchTransferFlow({
        type: TransferFlowActionType.Confirmed,
        lookup: confirmedLookup,
        idempotencyKey,
      })
    )
      return;

    const created = await createTransfer
      .mutateAsync({
        request: {
          recipientRef: confirmedLookup.recipientRef,
          amount: draft.amount,
        },
        idempotencyKey,
      })
      .catch(() => null);
    if (created === null) {
      dispatchTransferFlow({
        type: TransferFlowActionType.CreateNotSent,
        notice: TransferFlowScenario.ReviewUnexpected,
      });
      return;
    }
    if (
      !dispatchTransferFlow({
        type: TransferFlowActionType.Created,
        transferId: created.transfer.transferId,
        challenge: created.approval.challenge,
        expiresInSeconds: created.approval.expiresInSeconds,
      })
    )
      return;
    await sendTransferApproval();
  };

  return (
    <ButtonPrimary
      label={t("review.transfer")}
      loading={sending}
      onPress={() => {
        void createAndApproveTransfer().catch(() => {
          // Before the approval leaves the phone nothing can have moved, so review offers it again.
          // After, nothing proves where it ended: only the result page may say, with Home beneath it.
          const flow = transferFlowStore.getState();
          if (flow.step !== TransferFlowStep.Submitting) {
            dispatchTransferFlow(
              flow.step === TransferFlowStep.Approving
                ? {
                    type: TransferFlowActionType.ApprovalNotSent,
                    notice: TransferFlowScenario.ApprovalUnexpected,
                  }
                : {
                    type: TransferFlowActionType.CreateNotSent,
                    notice: TransferFlowScenario.ReviewUnexpected,
                  },
            );
            return;
          }
          void refreshAccountAndHistoryAfterApproval(queryClient);
          router.dismissTo("/");
          router.push(`/transfer/result/${flow.transferId}`);
          dispatchTransferFlow({ type: TransferFlowActionType.AnswerLost });
        });
      }}
    />
  );
}
