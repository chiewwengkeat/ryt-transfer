import { APP_LANGUAGE_NAMES, AppLanguage } from "@/shared/i18n/i18n";
import {
  colors,
  minTouchTarget,
  spacing,
  typography,
} from "@/shared/theme/theme";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text } from "react-native";
import BottomSheetLanguage from "./components/BottomSheetLanguage/BottomSheetLanguage";

export default function ButtonLanguage() {
  const { t, i18n } = useTranslation("home");
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const shortName = (
    Object.entries(APP_LANGUAGE_NAMES).find(
      ([language]) => language === i18n.language,
    )?.[1] ?? APP_LANGUAGE_NAMES[AppLanguage.English]
  ).short;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        // Starts with the text on screen, so voice control can press the button by what it shows.
        accessibilityLabel={`${shortName}, ${t("button_language.label")}`}
        accessibilityLanguage={i18n.language}
        onPress={() => setIsSheetOpen(true)}
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}
      >
        {/* The navigation bar never grows, so the label stops at what it holds. */}
        <Text maxFontSizeMultiplier={1.5} style={styles.textLabel}>
          {shortName}
        </Text>
      </Pressable>
      {isSheetOpen && (
        <BottomSheetLanguage onClose={() => setIsSheetOpen(false)} />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  main: {
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
  },
  pressed: { opacity: 0.6 },
  textLabel: { ...typography.label, color: colors.accent },
});
