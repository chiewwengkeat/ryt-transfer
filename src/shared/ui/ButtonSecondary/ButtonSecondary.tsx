import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text } from "react-native";

import {
  colors,
  minTouchTarget,
  radii,
  spacing,
  typography,
} from "@/shared/theme/theme";

interface Props {
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
}
export default function ButtonSecondary({
  label,
  accessibilityLabel,
  onPress,
}: Props) {
  const { i18n } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      // On the button, not its label: the screen reader reads the button as one element, in the button's language.
      accessibilityLanguage={i18n.language}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.surface,
  },
  buttonPressed: { opacity: 0.8 },
  label: { ...typography.label, color: colors.accent, textAlign: "center" },
});
