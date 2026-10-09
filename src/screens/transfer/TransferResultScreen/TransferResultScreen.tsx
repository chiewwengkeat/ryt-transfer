import { useQueryClient } from "@tanstack/react-query";
import { notificationAsync, NotificationFeedbackType } from "expo-haptics";
import {
  type NativeStackNavigationProp,
  router,
  Stack,
  useLocalSearchParams,
  useNavigation,
} from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useGetPrimaryAccount } from "@/domains/account/api/get-primary-account/get-primary-account";
import {
  isSettledTransferOutcome,
  type TransferOutcomeScenario,
} from "@/domains/transfer/api/get-transfer/get-transfer";
import {
  settlePendingTransfer,
  TransferReadFailure,
  useTransferStatusCheck,
} from "@/domains/transfer/lib/transfer-status-checks/transfer-status-checks";
import { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import { refreshAccountHistoryAndRecentRecipientsAfterApproval } from "@/screens/transfer/lib/refresh-after-approval/refresh-after-approval";
import { useIsScreenOnTop } from "@/shared/hooks/use-is-screen-on-top/use-is-screen-on-top";
import { reportError, trackEvent } from "@/shared/observability/observability";
import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";
import ButtonSecondary from "@/shared/ui/ButtonSecondary/ButtonSecondary";
import ViewScreenFrame from "@/shared/ui/ViewScreenFrame/ViewScreenFrame";

import SectionTransferDetails from "../components/SectionTransferDetails/SectionTransferDetails";
import IconTransferCompleted from "./components/IconTransferCompleted/IconTransferCompleted";
import TextOutcome from "./components/TextOutcome/TextOutcome";
import ViewOutcomeEntrance from "./components/ViewOutcomeEntrance/ViewOutcomeEntrance";
import {
  MONEY_STATE_BY_OUTCOME,
  MoneyState,
} from "./lib/transfer-outcome-money-states/transfer-outcome-money-states";

export default function TransferResultScreen() {
  const { t } = useTranslation("transfer");
  const queryClient = useQueryClient();
  const { transferId, checking } = useLocalSearchParams<{
    transferId: string;
    checking?: string;
  }>();
  const customerId = useGetPrimaryAccount().data?.customerId;
  const navigation =
    useNavigation<NativeStackNavigationProp<Record<string, object>>>();
  const [pageOpened, setPageOpened] = useState(false);
  useEffect(
    () =>
      navigation.addListener("transitionEnd", ({ data }) => {
        if (!data.closing) setPageOpened(true);
      }),
    [navigation],
  );
  const screenOnTop = useIsScreenOnTop();
  const outcomeShown = pageOpened && screenOnTop;
  const { transfer, readFailure, bankUnreachable } = useTransferStatusCheck(
    transferId,
    customerId,
    outcomeShown,
  );
  // Opened without the approve call's answer in hand, nothing has confirmed what the approval did.
  const [checkingUnansweredApproval] = useState(
    () => checking !== undefined || transfer.dataUpdatedAt === 0,
  );
  const outcome = transfer.data?.outcome;
  // A later read that fails never hides an outcome the bank has already settled.
  const outcomeSettled = isSettledTransferOutcome(outcome);
  const [openedSettled] = useState(outcomeSettled);
  const latestScenario = outcomeSettled
    ? outcome
    : readFailure === TransferReadFailure.NotFound
      ? TransferScenarioId.LastTransferNotFound
      : readFailure === TransferReadFailure.Unexpected ||
          outcome === TransferScenarioId.OutcomeUnexpected
        ? checkingUnansweredApproval
          ? TransferScenarioId.RecoveryUnexpected
          : TransferScenarioId.OutcomeUnexpected
        : (outcome ??
          (bankUnreachable
            ? TransferScenarioId.StatusUnreachable
            : ((
                [
                  TransferScenarioId.ApprovalUnknownAnswer,
                  TransferScenarioId.AppClosedDuringApproval,
                ] as const
              ).find((reason) => reason === checking) ??
              TransferScenarioId.ApprovalUnanswered)));
  // A refetch with no data clears the query's error until it answers, which would flip the page back to checking.
  const readingAgainAfterFailure =
    transfer.data === undefined &&
    transfer.isFetching &&
    transfer.errorUpdateCount > 0;
  const [heldScenario, setHeldScenario] =
    useState<TransferOutcomeScenario>(latestScenario);
  if (!readingAgainAfterFailure && heldScenario !== latestScenario)
    setHeldScenario(latestScenario);
  const scenario = readingAgainAfterFailure ? heldScenario : latestScenario;

  const reportedScenarioRef = useRef<TransferOutcomeScenario>(undefined);
  // Held while covered, never dropped: after sign-in the outcome is still on screen, so what shows then is reported.
  useEffect(() => {
    if (!screenOnTop || reportedScenarioRef.current === scenario) return;
    reportedScenarioRef.current = scenario;
    trackEvent("transfer_outcome", { scenario });
  }, [scenario, screenOnTop]);
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
              void (async () => {
                // Cleared before Home shows, or Home announces the outcome again.
                if (outcomeSettled && !outcomeShown && customerId !== undefined)
                  await settlePendingTransfer({
                    queryClient,
                    customerId,
                    transferId,
                    outcome,
                  }).catch((error: unknown) => {
                    reportError(error, { boundary: "pending_transfer" });
                  });
                router.dismissTo("/");
              })();
            }}
          />
        }
      >
        <ViewOutcomeEntrance outcome={scenario}>
          {scenario === TransferScenarioId.Completed && (
            <IconTransferCompleted />
          )}
          <TextOutcome
            scenario={scenario}
            transfer={transfer.data}
            transferId={transferId}
            pageOpened={pageOpened}
          />
          {scenario === TransferScenarioId.Completed && transfer.data && (
            <SectionTransferDetails transfer={transfer.data} />
          )}
          {[
            TransferScenarioId.OutcomeUnexpected,
            TransferScenarioId.LastTransferNotFound,
            TransferScenarioId.RecoveryUnexpected,
          ].includes(scenario) && (
            <ButtonSecondary
              label={t("result.transfer_history")}
              onPress={() => {
                router.replace("/transfer-history");
              }}
            />
          )}
          {scenario === TransferScenarioId.OutcomeUnexpected && (
            <ButtonSecondary
              label={t("common.outcome_unexpected.load_again")}
              onPress={() => {
                void transfer.refetch();
              }}
            />
          )}
        </ViewOutcomeEntrance>
      </ViewScreenFrame>
    </>
  );
}
