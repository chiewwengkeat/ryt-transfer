import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "zustand";

import { clearTransferScenario } from "@/mocks/demo-bank";
import { useDemoTranslation } from "@/mocks/switcher/components/OverlayDemo/hooks/use-demo-translation";
import { switcherStore } from "@/mocks/switcher/switcher-store";
import {
  colors,
  minTouchTarget,
  spacing,
  typography,
} from "@/shared/theme/theme";

export default function BannerDemo() {
  const { t, scenarioTitle } = useDemoTranslation();
  const scenarioId = useStore(switcherStore, (pick) => pick.scenarioId);
  const { top } = useSafeAreaInsets();
  if (scenarioId === null) return null;

  return (
    <View style={[styles.banner, { paddingTop: top }]}>
      <Text style={styles.message}>
        {t("banner_demo.message", { title: scenarioTitle(scenarioId) })}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("banner_demo.clear")}
        onPress={clearTransferScenario}
        style={styles.clearButton}
      >
        <Text style={styles.clearMark}>✕</Text>
      </Pressable>
    </View>
  );
}

// Touches pass through all but the ✕, so the screen's own header stays usable beneath it.
const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: spacing.md,
    backgroundColor: colors.warning,
    pointerEvents: "box-none",
  },
  message: {
    ...typography.label,
    flex: 1,
    color: colors.onAccent,
    pointerEvents: "none",
  },
  clearButton: {
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  clearMark: { ...typography.label, color: colors.onAccent },
});
