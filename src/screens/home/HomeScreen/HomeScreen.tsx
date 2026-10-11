import CardBalance from "@/domains/account/components/CardBalance/CardBalance";
import { useBalanceScenarios } from "@/domains/transfer/hooks/use-balance-scenarios/use-balance-scenarios";
import { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import ViewScreenFrame from "@/shared/ui/ViewScreenFrame/ViewScreenFrame";
import { useQueryClient } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import ButtonLanguage from "./components/ButtonLanguage/ButtonLanguage";
import ButtonStartTransfer from "./components/ButtonStartTransfer/ButtonStartTransfer";
import ButtonTransferHistory from "./components/ButtonTransferHistory/ButtonTransferHistory";
import SectionRecentRecipientsHome from "./components/SectionRecentRecipientsHome/SectionRecentRecipientsHome";
import SectionTransferNotices from "./components/SectionTransferNotices/SectionTransferNotices";
import { useBackTwiceToCloseApp } from "./hooks/use-back-twice-to-close-app/use-back-twice-to-close-app";
import { useStartTransferAvailability } from "./hooks/use-start-transfer-availability/use-start-transfer-availability";

export default function HomeScreen() {
  const { t } = useTranslation("home");
  useBackTwiceToCloseApp();
  const balanceScenarios = useBalanceScenarios(
    TransferScenarioId.StartUnexpected,
  );
  const { startTransferDisabledReason, firstReadRunning } =
    useStartTransferAvailability();
  const queryClient = useQueryClient();
  return (
    <>
      <Stack.Screen
        options={{
          title: t("home.title"),
          headerRight: () => <ButtonLanguage />,
        }}
      />
      <ViewScreenFrame
        footer={
          <ButtonStartTransfer
            disabledReason={startTransferDisabledReason}
            firstReadRunning={firstReadRunning}
          />
        }
        // Home is the stack's root, so every read still active is one of its own.
        onPullToRefresh={() => queryClient.refetchQueries({ type: "active" })}
      >
        <SectionTransferNotices />
        <CardBalance {...balanceScenarios} />
        <ButtonTransferHistory />
        <SectionRecentRecipientsHome
          startTransferDisabledReason={startTransferDisabledReason}
        />
      </ViewScreenFrame>
    </>
  );
}
