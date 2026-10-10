import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  colors,
  minTouchTarget,
  radii,
  spacing,
  typography,
} from "@/shared/theme/theme";
import TextBody from "@/shared/ui/TextBody/TextBody";

interface Props {
  label: string;
  onPress: () => void;
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
  const hasDisabledReason = disabledReason !== undefined;
  const disabled = loading || hasDisabledReason;
  const shownNotice = disabledReason ?? notice;
  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        // On the button, not its label: the screen reader reads the button as one element, in the button's language.
        accessibilityLanguage={i18n.language}
        accessibilityHint={shownNotice}
        accessibilityState={{ disabled, busy: loading }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.button,
          hasDisabledReason && styles.buttonDisabled,
          pressed && styles.buttonPressed,
        ]}
      >
        {loading ? (
          <ActivityIndicator
            color={hasDisabledReason ? colors.accent : colors.onAccent}
          />
        ) : (
          <Text style={[styles.label, disabled && styles.labelDisabled]}>
            {label}
          </Text>
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
  container: { gap: spacing.xs },
  button: {
    minHeight: minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.accent,
  },
  buttonDisabled: { backgroundColor: colors.surfaceDisabled },
  buttonPressed: { opacity: 0.8 },
  label: { ...typography.label, color: colors.onAccent, textAlign: "center" },
  labelDisabled: { color: colors.textSecondary },
});
