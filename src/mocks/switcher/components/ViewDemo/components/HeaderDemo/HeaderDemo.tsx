import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "zustand";

import { clearTransferScenario } from "@/mocks/demo-bank";
import { useDemoTranslation } from "@/mocks/switcher/components/ViewDemo/hooks/use-demo-translation";
import { switcherStore } from "@/mocks/switcher/switcher-store";
import {
  colors,
  minTouchTarget,
  spacing,
  typography,
} from "@/shared/theme/theme";

interface Props {
  appSheetOpen: boolean;
  onOpenMenu: () => void;
}
export default function HeaderDemo({ appSheetOpen, onOpenMenu }: Props) {
  const { t, scenarioTitle } = useDemoTranslation();
  const { i18n } = useTranslation();
  const scenarioId = useStore(switcherStore, (pick) => pick.scenarioId);
  const { top } = useSafeAreaInsets();

  return (
    <View
      // Above the app, this would take a screen reader's first focus from an open sheet.
      aria-hidden={appSheetOpen}
      style={[
        styles.header,
        { paddingTop: top },
        scenarioId !== null && styles.headerWithScenario,
      ]}
    >
      {scenarioId !== null && (
        <>
          <Text
            accessibilityLanguage={i18n.language}
            style={styles.scenarioMessage}
          >
            {t("banner_demo.message", { title: scenarioTitle(scenarioId) })}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("banner_demo.clear")}
            accessibilityLanguage={i18n.language}
            onPress={clearTransferScenario}
            style={styles.clearButton}
          >
            <Text aria-hidden style={styles.clearMark}>
              ✕
            </Text>
          </Pressable>
        </>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("pill_demo.open_menu")}
        accessibilityLanguage={i18n.language}
        onPress={onOpenMenu}
        style={styles.menuButton}
      >
        <Text style={styles.menuLabel}>{t("pill_demo.label")} ▾</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
    backgroundColor: colors.surface,
  },
  headerWithScenario: { backgroundColor: colors.warning },
  scenarioMessage: { ...typography.label, flex: 1, color: colors.onAccent },
  clearButton: {
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  clearMark: { ...typography.label, color: colors.onAccent },
  menuButton: {
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: minTouchTarget / 2,
    backgroundColor: colors.textPrimary,
  },
  menuLabel: { ...typography.label, color: colors.surface },
});
