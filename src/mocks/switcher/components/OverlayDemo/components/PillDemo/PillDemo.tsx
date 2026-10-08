import { Pressable, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useDemoTranslation } from "@/mocks/switcher/components/OverlayDemo/hooks/use-demo-translation";
import {
  colors,
  minTouchTarget,
  spacing,
  typography,
} from "@/shared/theme/theme";
import { useOpenBottomSheetHeight } from "@/shared/ui/ViewBottomSheetHost/ViewBottomSheetHost";
import { useScreenFooterHeight } from "@/shared/ui/ViewScreenFrame/ViewScreenFrame";

interface Props {
  onPress: () => void;
}
export default function PillDemo({ onPress }: Props) {
  const { t } = useDemoTranslation();
  const { bottom } = useSafeAreaInsets();
  const footerHeight = useScreenFooterHeight();
  const sheetHeight = useOpenBottomSheetHeight();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("pill_demo.open_menu")}
      onPress={onPress}
      style={[
        styles.pill,
        // Above the footer of the screen on top and any open sheet, so the pill never covers a screen's main
        // action or a sheet's keys.
        { bottom: Math.max(footerHeight, sheetHeight, bottom) + spacing.sm },
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
