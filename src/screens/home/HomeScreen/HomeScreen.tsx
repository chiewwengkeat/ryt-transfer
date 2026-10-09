import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";

import CardBalance from "@/domains/account/components/CardBalance/CardBalance";
import { useBalanceScenarios } from "@/domains/transfer/hooks/use-balance-scenarios/use-balance-scenarios";
import { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import ViewScreenFrame from "@/shared/ui/ViewScreenFrame/ViewScreenFrame";

import ButtonLanguage from "./components/ButtonLanguage/ButtonLanguage";
import ButtonStartTransfer from "./components/ButtonStartTransfer/ButtonStartTransfer";
import ButtonTransferHistory from "./components/ButtonTransferHistory/ButtonTransferHistory";
import SectionRecentRecipientsHome from "./components/SectionRecentRecipientsHome/SectionRecentRecipientsHome";
import SectionTransferNotices from "./components/SectionTransferNotices/SectionTransferNotices";

export default function HomeScreen() {
  const { t } = useTranslation("home");
  const balanceScenarios = useBalanceScenarios(
    TransferScenarioId.StartUnexpected,
  );
  return (
    <>
      <Stack.Screen
        options={{
          title: t("home.title"),
          headerRight: () => <ButtonLanguage />,
        }}
      />
      <ViewScreenFrame footer={<ButtonStartTransfer />}>
        <SectionTransferNotices />
        <CardBalance {...balanceScenarios} />
        <ButtonTransferHistory />
        <SectionRecentRecipientsHome />
      </ViewScreenFrame>
    </>
  );
}
