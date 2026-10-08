import { router } from "expo-router";
import { HeaderBackButton } from "expo-router/react-navigation";
import { useTranslation } from "react-i18next";
import { Platform, Pressable, StyleSheet, Text } from "react-native";

import { colors, minTouchTarget, typography } from "@/shared/theme/theme";

export default function ButtonHeaderBack() {
  const { t } = useTranslation("transfer");
  // A link can open History with nothing beneath it to go back to.
  const goBackOrHome = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  return Platform.OS === "android" ? (
    <HeaderBackButton
      accessibilityLabel={t("history.navigate_up")}
      onPress={goBackOrHome}
    />
  ) : (
    <Pressable
      accessibilityRole="button"
      onPress={goBackOrHome}
      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
    >
      <Text style={styles.label}>{t("history.back")}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
    justifyContent: "center",
  },
  buttonPressed: { opacity: 0.8 },
  label: { ...typography.label, color: colors.accent },
});
