import { router } from "expo-router";
import { HeaderBackButton } from "expo-router/react-navigation";
import { useTranslation } from "react-i18next";
import type { ColorValue } from "react-native";

interface Props {
  tintColor?: ColorValue;
  canGoBack?: boolean;
  opensHome: boolean;
}
export default function ButtonHeaderBack({
  tintColor,
  canGoBack,
  opensHome,
}: Props) {
  const { t } = useTranslation("shared");
  if (!opensHome && !canGoBack) return null;
  return (
    <HeaderBackButton
      tintColor={tintColor}
      displayMode="minimal"
      accessibilityLabel={
        opensHome ? t("button_header_back.home") : t("button_header_back.back")
      }
      onPress={() => {
        if (opensHome) router.dismissTo("/");
        else router.back();
      }}
    />
  );
}
