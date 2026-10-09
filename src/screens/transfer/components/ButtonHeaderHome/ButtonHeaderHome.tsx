import { router } from "expo-router";
import { HeaderBackButton } from "expo-router/react-navigation";
import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";

export default function ButtonHeaderHome(
  props: ComponentProps<typeof HeaderBackButton>,
) {
  const { t } = useTranslation("transfer");
  return (
    <HeaderBackButton
      {...props}
      displayMode="minimal"
      accessibilityLabel={t("common.back_to_home")}
      onPress={() => {
        router.dismissTo("/");
      }}
    />
  );
}
