import { useEffect } from "react";
import {
  AccessibilityInfo,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";

import {
  colors,
  minTouchTarget,
  radii,
  spacing,
  typography,
} from "@/shared/theme/theme";
import TextBody from "@/shared/ui/TextBody/TextBody";

interface Props extends Omit<TextInputProps, "style" | "accessibilityLabel"> {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
}
export default function FieldText({ label, error, ...inputProps }: Props) {
  // A screen reader stays on the input, so an error that appears below it would go unheard.
  useEffect(() => {
    if (error !== undefined) AccessibilityInfo.announceForAccessibility(error);
  }, [error]);

  return (
    <View style={styles.container}>
      <TextBody strong>{label}</TextBody>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.textSecondary}
        style={[styles.input, error !== undefined && styles.inputInvalid]}
        {...inputProps}
      />
      {error !== undefined && <TextBody tone="negative">{error}</TextBody>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  input: {
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
  inputInvalid: { borderColor: colors.negative, borderWidth: 2 },
});
