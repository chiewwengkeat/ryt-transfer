import {
  colors,
  minTouchTarget,
  radii,
  spacing,
  typography,
} from "@/shared/theme/theme";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";

interface Props {
  label: string;
  accessibilityLabel?: string;
  onPress: () => unknown;
}
export default function ButtonSecondary({
  label,
  accessibilityLabel,
  onPress,
}: Props) {
  const { i18n } = useTranslation();
  const [pressAnswerAwaited, setPressAnswerAwaited] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      // On the button, not its label: the screen reader reads the button as one element, in the button's language.
      accessibilityLanguage={i18n.language}
      accessibilityState={{
        disabled: pressAnswerAwaited,
        busy: pressAnswerAwaited,
      }}
      disabled={pressAnswerAwaited}
      onPress={() => {
        const pressAnswer = onPress();
        if (!(pressAnswer instanceof Promise)) return;
        setPressAnswerAwaited(true);
        void pressAnswer.finally(() => {
          setPressAnswerAwaited(false);
        });
      }}
      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
    >
      {/* Hidden, not removed: its lines keep the button's height while the spinner shows. */}
      <Text style={[styles.label, pressAnswerAwaited && styles.labelHidden]}>
        {label}
      </Text>
      {pressAnswerAwaited && (
        <ActivityIndicator color={colors.accent} style={styles.spinner} />
      )}
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
  buttonPressed: { opacity: 0.8, backgroundColor: colors.surfacePressed },
  label: { ...typography.label, color: colors.accent, textAlign: "center" },
  labelHidden: { opacity: 0 },
  spinner: StyleSheet.absoluteFill,
});
