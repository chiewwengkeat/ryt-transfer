import { clearTransferScenario } from "@/mocks/bank/bank";
import { useDemoTranslation } from "@/mocks/switcher/components/ViewDemo/hooks/use-demo-translation/use-demo-translation";
import { switcherStore } from "@/mocks/switcher/switcher-store/switcher-store";
import {
  colors,
  minTouchTarget,
  spacing,
  typography,
} from "@/shared/theme/theme";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "zustand";

interface Props {
  appSheetOpen: boolean;
  onOpenMenu: () => void;
}
export default function HeaderDemo({ appSheetOpen, onOpenMenu }: Props) {
  const { t, titleOfScenario } = useDemoTranslation();
  const { i18n } = useTranslation();

  const scenarioId = useStore(switcherStore, (pick) => pick.scenarioId);
  const { top } = useSafeAreaInsets();

  return (
    <View
      // Above the app, this would take a screen reader's first focus from an open sheet.
      aria-hidden={appSheetOpen}
      style={[
        styles.main,
        { paddingTop: top },
        scenarioId !== null && styles.withScenario,
      ]}
    >
      {scenarioId !== null && (
        <>
          {/* Capped, as are the controls beside it: at the largest text sizes the header otherwise fills the screen. */}
          <Text
            accessibilityLanguage={i18n.language}
            maxFontSizeMultiplier={1.5}
            numberOfLines={3}
            style={styles.textScenarioMessage}
          >
            {t("header_demo.banner.message", {
              title: titleOfScenario(scenarioId),
            })}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("header_demo.banner.clear")}
            accessibilityLanguage={i18n.language}
            onPress={clearTransferScenario}
            style={styles.btnClear}
          >
            <Text
              aria-hidden
              maxFontSizeMultiplier={1.5}
              style={styles.textClearMark}
            >
              ✕
            </Text>
          </Pressable>
        </>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("header_demo.pill.open_menu")}
        accessibilityLanguage={i18n.language}
        onPress={onOpenMenu}
        style={styles.btnMenu}
      >
        <Text maxFontSizeMultiplier={1.5} style={styles.textMenuLabel}>
          {t("header_demo.pill.label")} ▾
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  main: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
    backgroundColor: colors.surface,
  },
  withScenario: { backgroundColor: colors.warning },
  textScenarioMessage: { ...typography.label, flex: 1, color: colors.onAccent },
  btnClear: {
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
  textClearMark: { ...typography.label, color: colors.onAccent },
  btnMenu: {
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: minTouchTarget / 2,
    backgroundColor: colors.textPrimary,
  },
  textMenuLabel: { ...typography.label, color: colors.surface },
});
