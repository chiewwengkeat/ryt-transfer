import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text } from "react-native";

import {
  APP_LANGUAGE_NAMES,
  AppLanguage,
  followPhoneLanguage,
  pickAppLanguage,
  readPickedAppLanguage,
} from "@/shared/i18n/i18n";
import {
  colors,
  minTouchTarget,
  spacing,
  typography,
} from "@/shared/theme/theme";
import BottomSheetFrame from "@/shared/ui/BottomSheetFrame/BottomSheetFrame";

interface Props {
  onClose: () => void;
}
export default function BottomSheetLanguage({ onClose }: Props) {
  const { t, i18n } = useTranslation("home");
  // The React Compiler keeps this for as long as the sheet stays open, so every pick closes it.
  const pickedLanguage = readPickedAppLanguage();
  return (
    <BottomSheetFrame
      title={t("bottom_sheet_language.title")}
      closeLabel={t("bottom_sheet_language.close")}
      onClose={onClose}
    >
      {[
        {
          label: t("bottom_sheet_language.phone_language"),
          language: i18n.language,
          checked: pickedLanguage === undefined,
          pick: followPhoneLanguage,
        },
        ...Object.values(AppLanguage).map((language) => ({
          label: APP_LANGUAGE_NAMES[language].full,
          language,
          checked: pickedLanguage === language,
          pick: () => {
            pickAppLanguage(language);
          },
        })),
      ].map(({ label, language, checked, pick }) => (
        <Pressable
          key={label}
          accessibilityRole="radio"
          accessibilityLabel={label}
          accessibilityLanguage={language}
          accessibilityState={{ checked }}
          onPress={() => {
            pick();
            onClose();
          }}
          style={({ pressed }) => [styles.item, pressed && styles.pressed]}
        >
          <Text style={styles.label}>{label}</Text>
          {checked && <Text style={styles.tick}>✓</Text>}
        </Pressable>
      ))}
    </BottomSheetFrame>
  );
}

const styles = StyleSheet.create({
  item: {
    minHeight: minTouchTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  pressed: { opacity: 0.6 },
  label: { ...typography.body, flex: 1, color: colors.textPrimary },
  tick: { ...typography.body, color: colors.accent },
});
