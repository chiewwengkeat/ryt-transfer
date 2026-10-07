import { useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { router, Stack, useNavigation } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BackHandler } from "react-native";

import {
  APPROVAL_REFUSAL_CODES,
  useApproveTransfer,
} from "@/domains/transfer/api/approve-transfer/approve-transfer";
import { ApproveTransferErrorCode } from "@/domains/transfer/api/approve-transfer/approve-transfer.type";
import { useCreateTransfer } from "@/domains/transfer/api/create-transfer/create-transfer";
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

import { refreshAccountAndHistoryAfterApproval } from "../state/refresh-after-approval";
import {
  dispatchTransferFlow,
  TransferFlowActionType,
  TransferFlowScenario,
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
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const lookup = useLookupRecipient(draft.recipient);
  const createTransfer = useCreateTransfer();
  const signTransferApproval = useSignTransferApproval();
  const approveTransfer = useApproveTransfer();
  const [notSentMessage, setNotSentMessage] = useState<string>();
  // The approval left the phone and no answer proves where it ended, so sending again could pay twice.
  const [answerLostMessage, setAnswerLostMessage] = useState<string>();
  const answerLost = answerLostMessage !== undefined;

  const sending =
    step === TransferFlowStep.Creating ||
    step === TransferFlowStep.Approving ||
    step === TransferFlowStep.Submitting;
  const answerAwaited = step === TransferFlowStep.Submitting && !answerLost;
  const shownLookup = lookup.data;
  // No way back while sending: the bank's answer shows only here. The options below cover this stack only; the
  // root stack's swipe would close the whole flow, and Android's Back key bypasses options.
  useEffect(() => {
    if (!sending) return;
    const flowScreen = navigation.getParent();
    flowScreen?.setOptions({ gestureEnabled: false });
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => true,
    );
    return () => {
      subscription.remove();
      flowScreen?.setOptions({ gestureEnabled: true });
    };
  }, [navigation, sending]);

  const sendTransfer = async (confirmedLookup: LookupRecipientResponse) => {
    setNotSentMessage(undefined);
    const idempotencyKey = randomUUID();
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
      setNotSentMessage(t("common.review_unexpected.body"));
      return;
    }
    const { transferId } = created.transfer;
    if (
      !dispatchTransferFlow({
        type: TransferFlowActionType.Created,
        transferId,
        challenge: created.approval.challenge,
        expiresInSeconds: created.approval.expiresInSeconds,
      })
    )
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
      dispatchTransferFlow({
        type: TransferFlowActionType.ApprovalNotSent,
        notice: TransferFlowScenario.ApprovalCancelled,
      });
      setNotSentMessage(t("common.approval_cancelled.body"));
      return;
    }
    const attemptKey = randomUUID();
    if (
      !dispatchTransferFlow({
        type: TransferFlowActionType.ApprovalSent,
        attemptKey,
      })
    )
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
        dispatchTransferFlow({
          type: TransferFlowActionType.ApprovalNotSent,
          notice: TransferFlowScenario.ApprovalCancelled,
        });
        setNotSentMessage(t("common.approval_cancelled.body"));
      } else {
        setAnswerLostMessage(
          error instanceof TransportError &&
            error.code !== undefined &&
            !Object.values<string>(ApproveTransferErrorCode).includes(
              error.code,
            )
            ? t("common.approval_unknown_answer.body")
            : t("common.approval_unanswered.body"),
        );
        // It may have debited, and Home would keep showing the balance it read before.
        void refreshAccountAndHistoryAfterApproval(queryClient);
      }
      return;
    }
    void refreshAccountAndHistoryAfterApproval(queryClient);
    // From Home, so Back from the result never reopens a transfer already sent.
    router.dismissTo("/");
    router.push(`/transfer/result/${transferId}`);
    dispatchTransferFlow({ type: TransferFlowActionType.ApprovalAnswered });
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
                  void sendTransfer(shownLookup).catch(() => {
                    // Nothing can move money before the approval leaves the phone or once the bank refuses it;
                    // otherwise a failure may hide a debit.
                    const stepAtFailure = transferFlowStore.getState().step;
                    if (
                      stepAtFailure === TransferFlowStep.Reviewing ||
                      stepAtFailure === TransferFlowStep.Creating ||
                      stepAtFailure === TransferFlowStep.Approving
                    ) {
                      dispatchTransferFlow(
                        stepAtFailure === TransferFlowStep.Approving
                          ? {
                              type: TransferFlowActionType.ApprovalNotSent,
                              notice: TransferFlowScenario.ApprovalUnexpected,
                            }
                          : {
                              type: TransferFlowActionType.CreateNotSent,
                              notice: TransferFlowScenario.ReviewUnexpected,
                            },
                      );
                      setNotSentMessage(t("common.approval_unexpected.body"));
                    } else {
                      setAnswerLostMessage(t("common.outcome_unexpected.body"));
                      void refreshAccountAndHistoryAfterApproval(queryClient);
                    }
                  });
                }}
              />
            )
          )
        }
      >
        {lookup.isPending && <Loader />}
        {/* Never while sending: it says no money moved, which a sent approval can make false. */}
        {lookup.isError && !sending && (
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
        {answerLostMessage !== undefined && (
          <BannerNotice tone="negative" message={answerLostMessage} />
        )}
        {notSentMessage !== undefined && (
          <BannerNotice tone="negative" message={notSentMessage} />
        )}
      </ViewScreenFrame>
    </>
  );
}
