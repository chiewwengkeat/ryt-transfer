import { useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { router, Stack } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BackHandler } from "react-native";

import { accountKeys } from "@/domains/account/api/account.keys";
import {
  APPROVAL_REFUSAL_CODES,
  useApproveTransfer,
} from "@/domains/transfer/api/approve-transfer/approve-transfer";
import { useCreateTransfer } from "@/domains/transfer/api/create-transfer/create-transfer";
import { resetTransferHistory } from "@/domains/transfer/api/list-transfers/list-transfers";
import { useLookupRecipient } from "@/domains/transfer/api/lookup-recipient/lookup-recipient";
import type { LookupRecipientResponse } from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import {
  TransportError,
  TransportErrorKind,
} from "@/shared/http/transport-error";
import BannerNotice from "@/shared/ui/BannerNotice/BannerNotice";
import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";
import ButtonSecondary from "@/shared/ui/ButtonSecondary/ButtonSecondary";
import Loader from "@/shared/ui/Loader/Loader";
import TextBody from "@/shared/ui/TextBody/TextBody";
import ViewScreenFrame from "@/shared/ui/ViewScreenFrame/ViewScreenFrame";

import {
  dispatchTransferFlow,
  TransferFlowActionType,
  TransferFlowStep,
  transferFlowStore,
  useTransferFlow,
} from "../state/transfer-flow";
import SectionReviewDetails from "./components/SectionReviewDetails/SectionReviewDetails";
import { useSignTransferApproval } from "./hooks/use-sign-transfer-approval";

export default function TransferReviewScreen() {
  const { t } = useTranslation("transfer");
  // Review shows, and the phone signs, the draft it opened with; the steps behind it cannot change it meanwhile.
  const [draft] = useState(() => {
    const flow = transferFlowStore.getState();
    if (flow.step !== TransferFlowStep.Reviewing)
      throw new Error(`Review opened while the transfer was ${flow.step}.`);
    return flow.draft;
  });
  const step = useTransferFlow((flow) => flow.step);
  const queryClient = useQueryClient();
  const lookup = useLookupRecipient(draft.recipient);
  const createTransfer = useCreateTransfer();
  const signTransferApproval = useSignTransferApproval();
  const approveTransfer = useApproveTransfer();
  const [notSentMessage, setNotSentMessage] = useState<string>();
  // The approval left the phone and no answer proves where it ended, so sending again could pay twice.
  const [answerLost, setAnswerLost] = useState(false);

  const sending =
    step === TransferFlowStep.Creating ||
    step === TransferFlowStep.Approving ||
    step === TransferFlowStep.Submitting;
  const answerAwaited = step === TransferFlowStep.Submitting && !answerLost;
  const shownLookup = lookup.data;
  // No way back while sending, Android's Back key included: the bank's answer shows only here.
  useEffect(() => {
    if (!sending) return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => true,
    );
    return () => {
      subscription.remove();
    };
  }, [sending]);

  const sendTransfer = async (confirmedLookup: LookupRecipientResponse) => {
    setNotSentMessage(undefined);
    const idempotencyKey = randomUUID();
    dispatchTransferFlow({
      type: TransferFlowActionType.Confirmed,
      lookup: confirmedLookup,
      idempotencyKey,
    });
    const confirmed = transferFlowStore.getState();
    if (
      confirmed.step !== TransferFlowStep.Creating ||
      confirmed.idempotencyKey !== idempotencyKey
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
      dispatchTransferFlow({ type: TransferFlowActionType.NotSent });
      setNotSentMessage(t("common.review_unexpected.body"));
      return;
    }
    const { transferId } = created.transfer;
    dispatchTransferFlow({
      type: TransferFlowActionType.Created,
      transferId,
      challenge: created.approval.challenge,
    });
    if (transferFlowStore.getState().step !== TransferFlowStep.Approving)
      return;

    const signedApproval = await signTransferApproval({
      transferId,
      challenge: created.approval.challenge,
      recipientRef: confirmedLookup.recipientRef,
      registeredName: confirmedLookup.recipient.registeredName,
      idValueMasked: confirmedLookup.recipient.idValueMasked,
      bankCode: confirmedLookup.recipient.bankCode,
      amount: draft.amount,
    });
    if (signedApproval === null) {
      dispatchTransferFlow({ type: TransferFlowActionType.NotSent });
      setNotSentMessage(t("common.approval_cancelled.body"));
      return;
    }
    const attemptKey = randomUUID();
    dispatchTransferFlow({
      type: TransferFlowActionType.ApprovalSent,
      attemptKey,
    });
    if (transferFlowStore.getState().step !== TransferFlowStep.Submitting)
      return;

    try {
      await approveTransfer.mutateAsync({
        transferId,
        request: signedApproval,
        idempotencyKey: attemptKey,
      });
    } catch (error) {
      if (
        error instanceof TransportError &&
        error.kind === TransportErrorKind.Http &&
        error.code !== undefined &&
        APPROVAL_REFUSAL_CODES.has(error.code)
      ) {
        dispatchTransferFlow({ type: TransferFlowActionType.NotSent });
        setNotSentMessage(t("common.approval_cancelled.body"));
      } else setAnswerLost(true);
      return;
    }
    void queryClient.invalidateQueries({ queryKey: accountKeys.all });
    void resetTransferHistory(queryClient);
    // From Home, so Back from the result never reopens a transfer already sent.
    router.dismissTo("/");
    router.push(`/transfer/result/${transferId}`);
    dispatchTransferFlow({ type: TransferFlowActionType.Completed });
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: t("review.title"),
          headerBackVisible: !sending,
          gestureEnabled: !sending,
        }}
      />
      <ViewScreenFrame
        footer={
          answerLost ? (
            <ButtonSecondary
              label={t("review.home")}
              onPress={() => {
                router.dismissTo("/");
              }}
            />
          ) : (
            shownLookup && (
              <ButtonPrimary
                label={t("review.transfer")}
                loading={sending}
                onPress={() => {
                  void sendTransfer(shownLookup);
                }}
              />
            )
          )
        }
      >
        {lookup.isPending && <Loader />}
        {lookup.isError && (
          <>
            <BannerNotice
              tone="negative"
              message={t("common.review_unexpected.body")}
            />
            <ButtonSecondary
              label={t("common.review_unexpected.retry")}
              onPress={() => {
                void lookup.refetch();
              }}
            />
          </>
        )}
        {shownLookup && (
          <SectionReviewDetails lookup={shownLookup} amount={draft.amount} />
        )}
        {answerAwaited && (
          <TextBody>{t("common.biometrics_recognised.body")}</TextBody>
        )}
        {answerLost && (
          <BannerNotice
            tone="negative"
            message={t("common.approval_unanswered.body")}
          />
        )}
        {notSentMessage !== undefined && (
          <BannerNotice tone="negative" message={notSentMessage} />
        )}
      </ViewScreenFrame>
    </>
  );
}
