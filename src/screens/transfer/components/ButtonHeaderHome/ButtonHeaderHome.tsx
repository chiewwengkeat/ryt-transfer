import { router } from "expo-router";
import { HeaderBackButton } from "expo-router/react-navigation";
import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";

export default function ButtonHeaderHome(
  props: ComponentProps<typeof HeaderBackButton>,
) {
  const { t } = useTranslation("transfer");
  return (
    <HeaderBackButton
      {...props}
      displayMode="minimal"
      accessibilityLabel={t("button_header_home.label")}
      onPress={() => {
        router.dismissTo("/");
      }}
      // Android starts a custom header-left 14dp right of its own back icon, and its title 4dp short.
      style={
        Platform.OS === "android" ? { marginStart: -3, marginEnd: 29 } : null
      }
    />
  );
}
