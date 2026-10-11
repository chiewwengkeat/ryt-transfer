import { useGetPrimaryAccount } from "@/domains/account/api/get-primary-account/get-primary-account";
import {
  isSettledTransferOutcome,
  type TransferOutcomeScenario,
} from "@/domains/transfer/api/get-transfer/get-transfer";
import { refreshPendingTransferNotices } from "@/domains/transfer/lib/pending-transfer-notices/pending-transfer-notices";
import { clearPendingTransfer } from "@/domains/transfer/lib/pending-transfers/pending-transfers";
import { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import {
  settlePendingTransfer,
  TransferReadFailure,
} from "@/domains/transfer/lib/transfer-status-checks/transfer-status-checks";
import SectionTransferDetails from "@/screens/transfer/components/SectionTransferDetails/SectionTransferDetails";
import TextOffline from "@/screens/transfer/components/TextOffline/TextOffline";
import { refreshAccountHistoryAndRecentRecipientsAfterApproval } from "@/screens/transfer/lib/refresh-after-approval/refresh-after-approval";
import {
  MONEY_STATE_BY_OUTCOME,
  MoneyState,
} from "@/screens/transfer/lib/transfer-money-state/transfer-money-state";
import { useIsScreenOnTop } from "@/shared/hooks/use-is-screen-on-top/use-is-screen-on-top";
import { usePhoneReportsConnection } from "@/shared/http/offline/offline";
import {
  reportError,
  trackEvent,
} from "@/shared/observability/observability/observability";
import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";
import ButtonSecondary from "@/shared/ui/ButtonSecondary/ButtonSecondary";
import ViewScreenFrame from "@/shared/ui/ViewScreenFrame/ViewScreenFrame";
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
import IconTransferCompleted from "./components/IconTransferCompleted/IconTransferCompleted";
import TextOutcome from "./components/TextOutcome/TextOutcome";
import ViewOutcomeEntrance from "./components/ViewOutcomeEntrance/ViewOutcomeEntrance";
import { useTransferOutcomeScenario } from "./hooks/use-transfer-outcome-scenario/use-transfer-outcome-scenario";

export default function TransferResultScreen() {
  const { t } = useTranslation("transfer");
  const queryClient = useQueryClient();
  const navigation =
    useNavigation<NativeStackNavigationProp<Record<string, object>>>();
  const { transferId, checking } = useLocalSearchParams<{
    transferId: string;
    checking?: string;
  }>();
  const [isPageOpened, setIsPageOpened] = useState(false);

  const reportedScenarioRef = useRef<TransferOutcomeScenario>(undefined);
  const customerId = useGetPrimaryAccount().data?.customerId;
  const isScreenOnTop = useIsScreenOnTop();
  const doesPhoneReportConnection = usePhoneReportsConnection();
  const { transfer, failureLatestRead, scenario } = useTransferOutcomeScenario(
    transferId,
    checking,
  );

  const isOutcomeShown = isPageOpened && isScreenOnTop;
  const outcome = transfer.data?.outcome;
  const isOutcomeSettled = isSettledTransferOutcome(outcome);
  const wasSettledRef = useRef(isOutcomeSettled);
  const displayedMoneyState = MONEY_STATE_BY_OUTCOME[scenario];

  useEffect(
    () =>
      navigation.addListener("transitionEnd", ({ data }) => {
        if (!data.closing) setIsPageOpened(true);
      }),
    [navigation],
  );
  useEffect(() => {
    if (customerId === undefined) return;
    void (async () => {
      if (failureLatestRead === TransferReadFailure.NotFound) {
        await clearPendingTransfer(customerId, transferId);
        await refreshPendingTransferNotices(queryClient, customerId);
      } else
        await settlePendingTransfer({
          queryClient,
          customerId,
          transferId,
          outcome,
          reference: transfer.data?.reference,
          // Back can pop the page as it opens, and Home then announces the outcome the person never saw.
          keepSettled: !isOutcomeShown,
        });
    })().catch((error: unknown) => {
      reportError(error, { boundary: "pending_transfer" });
    });
  }, [
    customerId,
    transferId,
    outcome,
    transfer.data?.reference,
    failureLatestRead,
    queryClient,
    isOutcomeShown,
  ]);
  // Held while covered, never dropped: after sign-in the outcome is still on screen, so what shows then is reported.
  useEffect(() => {
    if (!isScreenOnTop || reportedScenarioRef.current === scenario) return;
    reportedScenarioRef.current = scenario;
    trackEvent("transfer_outcome", { scenario });
  }, [scenario, isScreenOnTop]);
  useEffect(() => {
    // Settled after opening: any refresh the approve call made predates it, and it may have moved money.
    if (isOutcomeSettled && !wasSettledRef.current)
      void refreshAccountHistoryAndRecentRecipientsAfterApproval(queryClient);
  }, [isOutcomeSettled, queryClient]);
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
                if (
                  isOutcomeSettled &&
                  !isOutcomeShown &&
                  customerId !== undefined
                )
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
            pageOpened={isPageOpened}
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
          {scenario === TransferScenarioId.OutcomeUnexpected &&
            (doesPhoneReportConnection ? (
              <ButtonSecondary
                label={t("common.outcome_unexpected.load_again")}
                onPress={() => transfer.refetch()}
              />
            ) : (
              <TextOffline />
            ))}
        </ViewOutcomeEntrance>
      </ViewScreenFrame>
    </>
  );
}
