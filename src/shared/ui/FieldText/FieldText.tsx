import {
  colors,
  minTouchTarget,
  radii,
  spacing,
  typography,
} from "@/shared/theme/theme";
import TextBody from "@/shared/ui/TextBody/TextBody";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  AccessibilityInfo,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";

interface Props extends Omit<
  TextInputProps,
  "style" | "accessibilityLabel" | "accessibilityHint"
> {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
}
export default function FieldText({ label, error, ...inputProps }: Props) {
  const { i18n } = useTranslation();

  // A screen reader stays on the input, so an error that appears below it would go unheard.
  useEffect(() => {
    if (error !== undefined) AccessibilityInfo.announceForAccessibility(error);
  }, [error]);

  return (
    <View style={styles.main}>
      {/* Hidden from screen readers: the input below is named by it, so it would be read twice. */}
      <View aria-hidden>
        <TextBody strong>{label}</TextBody>
      </View>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={error}
        accessibilityLanguage={i18n.language}
        placeholderTextColor={colors.textSecondary}
        style={[
          styles.textInput,
          error !== undefined && styles.textInputInvalid,
        ]}
        {...inputProps}
      />
      {error !== undefined && <TextBody tone="negative">{error}</TextBody>}
    </View>
  );
}

const styles = StyleSheet.create({
  main: { gap: spacing.xs },
  textInput: {
    ...typography.body,
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderRadius: radii.sm,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
  },
  textInputInvalid: { borderColor: colors.negative, borderWidth: 2 },
});
