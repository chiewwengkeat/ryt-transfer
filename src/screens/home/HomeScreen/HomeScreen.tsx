import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";

import CardBalance from "@/domains/account/components/CardBalance/CardBalance";
import ViewScreenFrame from "@/shared/ui/ViewScreenFrame/ViewScreenFrame";

import ButtonStartTransfer from "./components/ButtonStartTransfer/ButtonStartTransfer";
import ButtonTransferHistory from "./components/ButtonTransferHistory/ButtonTransferHistory";
import SectionRecentRecipientsHome from "./components/SectionRecentRecipientsHome/SectionRecentRecipientsHome";

export default function HomeScreen() {
  const { t } = useTranslation("home");
  return (
    <>
      <Stack.Screen options={{ title: t("home.title") }} />
      <ViewScreenFrame footer={<ButtonStartTransfer />}>
        <CardBalance unexpectedScenario="start_unexpected" />
        <ButtonTransferHistory />
        <SectionRecentRecipientsHome />
      </ViewScreenFrame>
    </>
  );
}
