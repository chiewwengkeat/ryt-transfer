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
  const [isPressAnswerAwaited, setIsPressAnswerAwaited] = useState(false);

  const isBusy = loading || isPressAnswerAwaited;
  const hasDisabledReason = disabledReason !== undefined;
  const isDisabled = isBusy || hasDisabledReason;
  const noticeShown = disabledReason ?? notice;

  return (
    <View style={styles.main}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        // On the button, not its label: the screen reader reads the button as one element, in the button's language.
        accessibilityLanguage={i18n.language}
        accessibilityHint={noticeShown}
        accessibilityState={{ disabled: isDisabled, busy: isBusy }}
        disabled={isDisabled}
        onPress={() => {
          const pressAnswer = onPress();
          if (!(pressAnswer instanceof Promise)) return;
          setIsPressAnswerAwaited(true);
          void pressAnswer.finally(() => {
            setIsPressAnswerAwaited(false);
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
            isDisabled && styles.textLabelDisabled,
            isBusy && styles.textLabelHidden,
          ]}
        >
          {label}
        </Text>
        {isBusy && (
          <ActivityIndicator
            color={hasDisabledReason ? colors.accent : colors.onAccent}
            style={styles.spinner}
          />
        )}
      </Pressable>
      {noticeShown !== undefined && (
        <TextBody tone="warning" alignCenter>
          {noticeShown}
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
