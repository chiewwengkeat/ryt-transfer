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
  const [isPressAnswerAwaited, setIsPressAnswerAwaited] = useState(false);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      // On the button, not its label: the screen reader reads the button as one element, in the button's language.
      accessibilityLanguage={i18n.language}
      accessibilityState={{
        disabled: isPressAnswerAwaited,
        busy: isPressAnswerAwaited,
      }}
      disabled={isPressAnswerAwaited}
      onPress={() => {
        const pressAnswer = onPress();
        if (!(pressAnswer instanceof Promise)) return;
        setIsPressAnswerAwaited(true);
        pressAnswer.finally(() => {
          setIsPressAnswerAwaited(false);
        });
      }}
      style={({ pressed }) => [styles.main, pressed && styles.pressed]}
    >
      {/* Hidden, not removed: its lines keep the button's height while the spinner shows. */}
      <Text
        style={[
          styles.textLabel,
          isPressAnswerAwaited && styles.textLabelHidden,
        ]}
      >
        {label}
      </Text>
      {isPressAnswerAwaited && (
        <ActivityIndicator color={colors.accent} style={styles.spinner} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  main: {
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
  pressed: { opacity: 0.8, backgroundColor: colors.surfacePressed },
  textLabel: { ...typography.label, color: colors.accent, textAlign: "center" },
  textLabelHidden: { opacity: 0 },
  spinner: StyleSheet.absoluteFill,
});
