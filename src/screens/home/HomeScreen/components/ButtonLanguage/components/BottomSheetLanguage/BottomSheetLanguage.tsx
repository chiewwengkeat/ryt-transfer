import { useInitialValue } from "@/shared/hooks/use-initial-value/use-initial-value";
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
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text } from "react-native";

interface Props {
  onClose: () => void;
}
export default function BottomSheetLanguage({ onClose }: Props) {
  const { t, i18n } = useTranslation("home");
  const pickedLanguage = useInitialValue(readPickedAppLanguage);

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
          isChecked: pickedLanguage === undefined,
          pick: followPhoneLanguage,
        },
        ...Object.values(AppLanguage).map((language) => ({
          label: APP_LANGUAGE_NAMES[language].full,
          language,
          isChecked: pickedLanguage === language,
          pick: () => pickAppLanguage(language),
        })),
      ].map(({ label, language, isChecked, pick }) => (
        <Pressable
          key={label}
          accessibilityRole="radio"
          accessibilityLabel={label}
          accessibilityLanguage={language}
          accessibilityState={{ checked: isChecked }}
          onPress={() => {
            pick();
            onClose();
          }}
          style={({ pressed }) => [
            styles.btnItem,
            pressed && styles.btnPressed,
          ]}
        >
          <Text style={styles.textLabel}>{label}</Text>
          {isChecked && <Text style={styles.textTick}>✓</Text>}
        </Pressable>
      ))}
    </BottomSheetFrame>
  );
}

const styles = StyleSheet.create({
  btnItem: {
    minHeight: minTouchTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  btnPressed: { opacity: 0.6 },
  textLabel: { ...typography.body, flex: 1, color: colors.textPrimary },
  textTick: { ...typography.body, color: colors.accent },
});
