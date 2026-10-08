import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text } from "react-native";

import { colors, minTouchTarget, typography } from "@/shared/theme/theme";

export default function ButtonHeaderBack() {
  const { t } = useTranslation("transfer");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("history.back")}
      onPress={() => {
        // A link can open History with nothing beneath it to go back to.
        if (router.canGoBack()) router.back();
        else router.replace("/");
      }}
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
