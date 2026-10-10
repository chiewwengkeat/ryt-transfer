import { useQueryClient } from "@tanstack/react-query";
import { Stack, useNavigation } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BackHandler } from "react-native";

import BannerEarlierTransferUnconfirmed from "@/domains/transfer/components/BannerEarlierTransferUnconfirmed/BannerEarlierTransferUnconfirmed";
import { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import ButtonHeaderBack from "@/shared/ui/ButtonHeaderBack/ButtonHeaderBack";
import TextBody from "@/shared/ui/TextBody/TextBody";
import ViewScreenFrame from "@/shared/ui/ViewScreenFrame/ViewScreenFrame";

import BannerFlowNotice from "@/screens/transfer/components/BannerFlowNotice/BannerFlowNotice";
import { refreshAccountHistoryAndRecentRecipientsAfterApproval } from "@/screens/transfer/lib/refresh-after-approval/refresh-after-approval";
import {
  isTransferSentOrBeingSent,
  TransferFlowStep,
  transferFlowStore,
  useTransferFlow,
} from "@/screens/transfer/flow-store/flow-store";
import ButtonConfirmTransfer from "./components/ButtonConfirmTransfer/ButtonConfirmTransfer";
import SectionReviewDetails from "./components/SectionReviewDetails/SectionReviewDetails";

export default function TransferReviewScreen() {
  const queryClient = useQueryClient();
  // Review shows, and the phone signs, the draft it opened with; the steps behind it cannot change it meanwhile.
  const [draft] = useState(() => {
    const flow = transferFlowStore.getState();
    if (flow.step !== TransferFlowStep.Reviewing)
      throw new Error(`Review opened while the transfer was ${flow.step}.`);
    return flow.draft;
  });
  const phoneRefused = useTransferFlow(
    (flow) =>
      flow.step === TransferFlowStep.Reviewing &&
      flow.notice === TransferScenarioId.RootedPhone,
  );

  return (
    <>
      <HeaderReview />
      <ViewScreenFrame
        footer={
          // A refused phone sees the refusal alone, in Transfer's place: nothing beside it may offer a way to approve.
          phoneRefused ? (
            <BannerFlowNotice step={TransferFlowStep.Reviewing} />
          ) : (
            <ButtonConfirmTransfer draft={draft} />
          )
        }
      >
        {!phoneRefused && (
          <BannerEarlierTransferUnconfirmed
            onEarlierTransferSettled={() => {
              void refreshAccountHistoryAndRecentRecipientsAfterApproval(
                queryClient,
              );
            }}
          />
        )}
        <SectionReviewDetails draft={draft} />
        <TextSendingTransfer />
        {!phoneRefused && (
          <BannerFlowNotice step={TransferFlowStep.Reviewing} />
        )}
      </ViewScreenFrame>
    </>
  );
}

function HeaderReview() {
  const { t } = useTranslation("transfer");
  const navigation = useNavigation();
  const sending = useTransferFlow(isTransferSentOrBeingSent);
  // Android's Back and the root stack's swipe too, which this stack's options never reach: leaving
  // mid-send strands an approval no screen can answer.
  useEffect(() => {
    if (!sending) return;
    const flowScreen = navigation.getParent();
    flowScreen?.setOptions({ gestureEnabled: false });
    const backPress = BackHandler.addEventListener(
      "hardwareBackPress",
      () => true,
    );
    return () => {
      backPress.remove();
      flowScreen?.setOptions({ gestureEnabled: true });
    };
  }, [navigation, sending]);

  return (
    <Stack.Screen
      options={{
        title: t("header_review.title"),
        // Set on every render: options merge, so a key set only while sending would outlive the send.
        headerLeft: sending
          ? () => null
          : ({ tintColor, canGoBack }) => (
              <ButtonHeaderBack
                tintColor={tintColor}
                canGoBack={canGoBack}
                opensHome={false}
              />
            ),
        headerBackVisible: false,
        gestureEnabled: !sending,
      }}
    />
  );
}

function TextSendingTransfer() {
  const { t } = useTranslation("transfer");
  // Through Done as well: review stays drawn until the result page covers it.
  const approvalSent = useTransferFlow(
    (flow) =>
      flow.step === TransferFlowStep.Submitting ||
      flow.step === TransferFlowStep.Done,
  );
  if (!approvalSent) return null;
  return <TextBody>{t("common.biometrics_recognised.body")}</TextBody>;
}
