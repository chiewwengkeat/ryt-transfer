import { useTranslation } from "react-i18next";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { colors, spacing } from "@/shared/theme/theme";

export default function Loader() {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <ActivityIndicator
        accessibilityLabel={t("loader.label")}
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
