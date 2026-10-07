import { Pressable, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useDemoTranslation } from "@/mocks/switcher/components/OverlayDemo/hooks/use-demo-translation";
import {
  colors,
  minTouchTarget,
  spacing,
  typography,
} from "@/shared/theme/theme";

interface Props {
  onPress: () => void;
}
export default function PillDemo({ onPress }: Props) {
  const { t } = useDemoTranslation();
  const { bottom } = useSafeAreaInsets();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("pill_demo.open_menu")}
      onPress={onPress}
      style={[
        styles.pill,
        // Clears a screen footer holding one button, so the pill never covers a screen's main action.
        { bottom: bottom + spacing.md * 2 + minTouchTarget + spacing.sm },
      ]}
    >
      <Text style={styles.label}>{t("pill_demo.label")} ▾</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: "absolute",
    right: spacing.md,
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: minTouchTarget / 2,
    backgroundColor: colors.textPrimary,
  },
  label: { ...typography.label, color: colors.surface },
});
