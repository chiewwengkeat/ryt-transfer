import {
  colors,
  minTouchTarget,
  radii,
  spacing,
  typography,
} from "@/shared/theme/theme";
import TextBody from "@/shared/ui/TextBody/TextBody";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

interface Props {
  label: string;
  onPress: () => unknown;
  loading?: boolean;
  disabledReason?: string;
  notice?: string;
}
export default function ButtonPrimary({
  label,
  onPress,
  loading = false,
  disabledReason,
  notice,
}: Props) {
  const { i18n } = useTranslation();
  const [pressAnswerAwaited, setPressAnswerAwaited] = useState(false);
  const busy = loading || pressAnswerAwaited;
  const hasDisabledReason = disabledReason !== undefined;
  const disabled = busy || hasDisabledReason;
  const shownNotice = disabledReason ?? notice;
  return (
    <View style={styles.main}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        // On the button, not its label: the screen reader reads the button as one element, in the button's language.
        accessibilityLanguage={i18n.language}
        accessibilityHint={shownNotice}
        accessibilityState={{ disabled, busy }}
        disabled={disabled}
        onPress={() => {
          const pressAnswer = onPress();
          if (!(pressAnswer instanceof Promise)) return;
          setPressAnswerAwaited(true);
          void pressAnswer.finally(() => {
            setPressAnswerAwaited(false);
          });
        }}
        style={({ pressed }) => [
          styles.btn,
          hasDisabledReason && styles.btnDisabled,
          pressed && styles.btnPressed,
        ]}
      >
        {/* Hidden, not removed: its lines keep the button's height while the spinner shows. */}
        <Text
          style={[
            styles.textLabel,
            disabled && styles.textLabelDisabled,
            busy && styles.textLabelHidden,
          ]}
        >
          {label}
        </Text>
        {busy && (
          <ActivityIndicator
            color={hasDisabledReason ? colors.accent : colors.onAccent}
            style={styles.spinner}
          />
        )}
      </Pressable>
      {shownNotice !== undefined && (
        <TextBody tone="warning" alignCenter>
          {shownNotice}
        </TextBody>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  main: { gap: spacing.xs },
  btn: {
    minHeight: minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.accent,
  },
  btnDisabled: { backgroundColor: colors.surfaceDisabled },
  btnPressed: { opacity: 0.8 },
  textLabel: {
    ...typography.label,
    color: colors.onAccent,
    textAlign: "center",
  },
  textLabelDisabled: { color: colors.textSecondary },
  textLabelHidden: { opacity: 0 },
  spinner: StyleSheet.absoluteFill,
});
