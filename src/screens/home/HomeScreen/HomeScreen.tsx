import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";

import ViewScreenFrame from "@/shared/ui/ViewScreenFrame/ViewScreenFrame";

import CardBalance from "./components/CardBalance/CardBalance";

export default function HomeScreen() {
  const { t } = useTranslation("home");
  return (
    <>
      <Stack.Screen options={{ title: t("home.title") }} />
      <ViewScreenFrame>
        <CardBalance />
      </ViewScreenFrame>
    </>
  );
}
