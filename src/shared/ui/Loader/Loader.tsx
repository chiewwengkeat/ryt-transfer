import { colors, spacing } from "@/shared/theme/theme";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, StyleSheet, View } from "react-native";

export default function Loader() {
  const { t, i18n } = useTranslation(["shared"]);

  return (
    <View style={styles.main}>
      <ActivityIndicator
        accessibilityLabel={t("shared:loader.label")}
        accessibilityLanguage={i18n.language}
        color={colors.accent}
        size="large"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  main: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
});
