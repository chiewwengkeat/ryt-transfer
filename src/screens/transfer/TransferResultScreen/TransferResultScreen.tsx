import { useQueryClient } from "@tanstack/react-query";
import { notificationAsync, NotificationFeedbackType } from "expo-haptics";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native";
import Animated, { Keyframe } from "react-native-reanimated";

import { useGetPrimaryAccount } from "@/domains/account/api/get-primary-account/get-primary-account";
import { TransferOutcomeScenario } from "@/domains/transfer/api/get-transfer/get-transfer";
import {
  TransferReadFailure,
  useTransferStatusCheck,
} from "@/domains/transfer/hooks/transfer-status-checks";
import { refreshAccountHistoryAndRecentRecipientsAfterApproval } from "@/screens/transfer/state/refresh-after-approval";
import { motionDurations, standardEasing } from "@/shared/lib/motion/motion";
import { trackEvent } from "@/shared/observability/observability";
import { spacing } from "@/shared/theme/theme";
import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";
import ButtonSecondary from "@/shared/ui/ButtonSecondary/ButtonSecondary";
import ViewScreenFrame from "@/shared/ui/ViewScreenFrame/ViewScreenFrame";

import SectionTransferDetails from "../components/SectionTransferDetails/SectionTransferDetails";
import IconTransferCompleted from "./components/IconTransferCompleted/IconTransferCompleted";
import TextOutcome from "./components/TextOutcome/TextOutcome";
import {
  MONEY_STATE_BY_OUTCOME,
  MoneyState,
} from "./transfer-outcome-money-states";

export default function TransferResultScreen() {
  const { t } = useTranslation("transfer");
  const queryClient = useQueryClient();
  const { transferId, checking } = useLocalSearchParams<{
    transferId: string;
    checking?: string;
  }>();
  const customerId = useGetPrimaryAccount().data?.customerId;
  const { transfer, readFailure, bankUnreachable } = useTransferStatusCheck(
    transferId,
    customerId,
  );
  // Opened without the approve call's answer in hand, nothing has confirmed what the approval did.
  const [checkingUnansweredApproval] = useState(
    () => checking !== undefined || transfer.dataUpdatedAt === 0,
  );
  const outcome = transfer.data?.outcome;
  // A later read that fails never hides an outcome the bank has already settled.
  const outcomeSettled =
    outcome !== undefined &&
    outcome !== null &&
    outcome !== TransferOutcomeScenario.Processing &&
    outcome !== TransferOutcomeScenario.HeldForReview &&
    outcome !== TransferOutcomeScenario.OutcomeUnexpected;
  const [openedSettled] = useState(outcomeSettled);
  const scenario = outcomeSettled
    ? outcome
    : readFailure === TransferReadFailure.NotFound
      ? TransferOutcomeScenario.LastTransferNotFound
      : readFailure === TransferReadFailure.Unexpected ||
          outcome === TransferOutcomeScenario.OutcomeUnexpected
        ? checkingUnansweredApproval
          ? TransferOutcomeScenario.RecoveryUnexpected
          : TransferOutcomeScenario.OutcomeUnexpected
        : (outcome ??
          (bankUnreachable
            ? TransferOutcomeScenario.StatusUnreachable
            : ([
                TransferOutcomeScenario.ApprovalUnknownAnswer,
                TransferOutcomeScenario.AppClosedDuringApproval,
              ].find((reason) => reason === checking) ??
              TransferOutcomeScenario.ApprovalUnanswered)));

  useEffect(() => {
    trackEvent("transfer_outcome", { scenario });
  }, [scenario]);
  useEffect(() => {
    // Settled after opening: any refresh the approve call made predates it, and it may have moved money.
    if (outcomeSettled && !openedSettled)
      void refreshAccountHistoryAndRecentRecipientsAfterApproval(queryClient);
  }, [outcomeSettled, openedSettled, queryClient]);
  const displayedMoneyState = MONEY_STATE_BY_OUTCOME[scenario];
  useEffect(() => {
    switch (displayedMoneyState) {
      case MoneyState.MoneyMoved:
        void notificationAsync(NotificationFeedbackType.Success);
        break;
      case MoneyState.NotConfirmedYet:
      case MoneyState.MoneyReturned:
        void notificationAsync(NotificationFeedbackType.Warning);
        break;
      case MoneyState.NoMoneyMoved:
        void notificationAsync(NotificationFeedbackType.Error);
        break;
    }
  }, [displayedMoneyState]);

  return (
    <>
      <Stack.Screen options={{ title: t("result.title") }} />
      <ViewScreenFrame
        footer={
          <ButtonPrimary
            label={t("result.done")}
            onPress={() => {
              router.dismissTo("/");
            }}
          />
        }
      >
        {/* Unkeyed: a remount would reset TextOutcome's focus and its announcement of a settled outcome. */}
        <Animated.View
          entering={new Keyframe({
            0: { opacity: 0, transform: [{ scale: 0.96 }] },
            100: {
              opacity: 1,
              transform: [{ scale: 1 }],
              easing: standardEasing,
            },
          }).duration(motionDurations.screenContentEntrance)}
          style={styles.outcome}
        >
          {scenario === TransferOutcomeScenario.Completed && (
            <IconTransferCompleted />
          )}
          <TextOutcome
            scenario={scenario}
            transfer={transfer.data}
            transferId={transferId}
          />
          {scenario === TransferOutcomeScenario.Completed && transfer.data && (
            <SectionTransferDetails transfer={transfer.data} />
          )}
          {[
            TransferOutcomeScenario.OutcomeUnexpected,
            TransferOutcomeScenario.LastTransferNotFound,
            TransferOutcomeScenario.RecoveryUnexpected,
          ].includes(scenario) && (
            <ButtonSecondary
              label={t("result.check_history")}
              onPress={() => {
                router.push("/transfer-history");
              }}
            />
          )}
          {scenario === TransferOutcomeScenario.OutcomeUnexpected && (
            <ButtonSecondary
              label={t("common.outcome_unexpected.load_again")}
              onPress={() => {
                void transfer.refetch();
              }}
            />
          )}
        </Animated.View>
      </ViewScreenFrame>
    </>
  );
}

const styles = StyleSheet.create({
  outcome: { gap: spacing.md },
});
