import { useTranslation } from "react-i18next";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { colors, spacing } from "@/shared/theme/theme";

export default function Loader() {
  const { t, i18n } = useTranslation(["shared"]);
  return (
    <View style={styles.container}>
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
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
});
