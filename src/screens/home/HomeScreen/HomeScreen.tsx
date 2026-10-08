import { router, Stack } from "expo-router";
import { useTranslation } from "react-i18next";

import CardBalance from "@/domains/account/components/CardBalance/CardBalance";
import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";
import ViewScreenFrame from "@/shared/ui/ViewScreenFrame/ViewScreenFrame";

import ButtonTransferHistory from "./components/ButtonTransferHistory/ButtonTransferHistory";

export default function HomeScreen() {
  const { t } = useTranslation("home");
  return (
    <>
      <Stack.Screen options={{ title: t("home.title") }} />
      <ViewScreenFrame
        footer={
          <ButtonPrimary
            label={t("home.transfer")}
            onPress={() => {
              router.push("/transfer");
            }}
          />
        }
      >
        <CardBalance />
        <ButtonTransferHistory />
      </ViewScreenFrame>
    </>
  );
}
