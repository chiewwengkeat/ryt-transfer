import { clearTransferScenario } from "@/mocks/bank/bank";
import type { DemoLayer } from "@/mocks/demo-layer/demo-layer";
import { switcherStore } from "@/mocks/switcher/switcher-store/switcher-store";
import {
  colors,
  minTouchTarget,
  spacing,
  typography,
} from "@/shared/theme/theme";
import ViewBottomSheetHost from "@/shared/ui/ViewBottomSheetHost/ViewBottomSheetHost";
import { useState, type ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  SafeAreaInsetsContext,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useStore } from "zustand";
import BottomSheetDemo from "./components/BottomSheetDemo/BottomSheetDemo";
import { useDemoTranslation } from "./hooks/use-demo-translation/use-demo-translation";

type Props = ComponentProps<DemoLayer["ViewDemo"]>;
export default function ViewDemo({
  appSheetOpen,
  children,
  onResetDemo,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const insets = useSafeAreaInsets();
  return (
    <ViewBottomSheetHost>
      <HeaderDemo
        appSheetOpen={appSheetOpen}
        onOpenMenu={() => {
          setMenuOpen(true);
        }}
      />
      {/* The header has taken the status bar's place, so a screen's own header must not pad for it again. */}
      <SafeAreaInsetsContext value={{ ...insets, top: 0 }}>
        <View style={styles.app}>{children}</View>
      </SafeAreaInsetsContext>
      {menuOpen && (
        <BottomSheetDemo
          onResetDemo={onResetDemo}
          onClose={() => {
            setMenuOpen(false);
          }}
        />
      )}
    </ViewBottomSheetHost>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1 },
});

interface HeaderDemoProps {
  appSheetOpen: boolean;
  onOpenMenu: () => void;
}
function HeaderDemo({ appSheetOpen, onOpenMenu }: HeaderDemoProps) {
  const { t, scenarioTitle } = useDemoTranslation();
  const { i18n } = useTranslation();
  const scenarioId = useStore(switcherStore, (pick) => pick.scenarioId);
  const { top } = useSafeAreaInsets();

  return (
    <View
      // Above the app, this would take a screen reader's first focus from an open sheet.
      aria-hidden={appSheetOpen}
      style={[
        headerDemoStyles.header,
        { paddingTop: top },
        scenarioId !== null && headerDemoStyles.headerWithScenario,
      ]}
    >
      {scenarioId !== null && (
        <>
          {/* Capped, as are the controls beside it: at the largest text sizes the header otherwise fills the screen. */}
          <Text
            accessibilityLanguage={i18n.language}
            maxFontSizeMultiplier={1.5}
            numberOfLines={3}
            style={headerDemoStyles.scenarioMessage}
          >
            {t("header_demo.banner.message", {
              title: scenarioTitle(scenarioId),
            })}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("header_demo.banner.clear")}
            accessibilityLanguage={i18n.language}
            onPress={clearTransferScenario}
            style={headerDemoStyles.clearButton}
          >
            <Text
              aria-hidden
              maxFontSizeMultiplier={1.5}
              style={headerDemoStyles.clearMark}
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
        style={headerDemoStyles.menuButton}
      >
        <Text maxFontSizeMultiplier={1.5} style={headerDemoStyles.menuLabel}>
          {t("header_demo.pill.label")} ▾
        </Text>
      </Pressable>
    </View>
  );
}

const headerDemoStyles = StyleSheet.create({
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
