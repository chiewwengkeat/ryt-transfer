import CardBalance from "@/domains/account/components/CardBalance/CardBalance";
import SectionRecentRecipients from "@/domains/transfer/components/SectionRecentRecipients/SectionRecentRecipients";
import { useBalanceScenarios } from "@/domains/transfer/hooks/use-balance-scenarios/use-balance-scenarios";
import { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import ViewScreenFrame from "@/shared/ui/ViewScreenFrame/ViewScreenFrame";
import { useQueryClient } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import BannerRecentRecipientsFailed from "./components/BannerRecentRecipientsFailed/BannerRecentRecipientsFailed";
import ButtonLanguage from "./components/ButtonLanguage/ButtonLanguage";
import ButtonStartTransfer from "./components/ButtonStartTransfer/ButtonStartTransfer";
import ButtonTransferHistory from "./components/ButtonTransferHistory/ButtonTransferHistory";
import SectionTransferNotices from "./components/SectionTransferNotices/SectionTransferNotices";
import { useBackTwiceToCloseApp } from "./hooks/use-back-twice-to-close-app/use-back-twice-to-close-app";
import { useStartTransferAvailability } from "./hooks/use-start-transfer-availability/use-start-transfer-availability";

export default function HomeScreen() {
  const { t } = useTranslation("home");
  const queryClient = useQueryClient();
  useBackTwiceToCloseApp();

  const balanceScenarios = useBalanceScenarios(
    TransferScenarioId.StartUnexpected,
  );
  const { reasonStartTransferDisabled, isFirstReadRunning } =
    useStartTransferAvailability();

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
            disabledReason={reasonStartTransferDisabled}
            firstReadRunning={isFirstReadRunning}
          />
        }
        // Home is the stack's root, so every read still active is one of its own.
        onPullToRefresh={() => queryClient.refetchQueries({ type: "active" })}
      >
        <SectionTransferNotices />
        <CardBalance {...balanceScenarios} />
        <ButtonTransferHistory />
        <BannerRecentRecipientsFailed />
        <SectionRecentRecipients
          disabledReason={reasonStartTransferDisabled}
          onRecentChosen={(recentId) => {
            router.push({ pathname: "/transfer", params: { recentId } });
          }}
        />
      </ViewScreenFrame>
    </>
  );
}
