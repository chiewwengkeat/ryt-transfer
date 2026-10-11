import {
  colors,
  minTouchTarget,
  radii,
  spacing,
  typography,
} from "@/shared/theme/theme";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";

interface Props {
  pinLength: number;
  digitsEntered: number;
  disabled: boolean;
  onPressDigit: (digit: string) => void;
  onPressDelete: () => void;
}
export default function KeypadPin({
  pinLength,
  digitsEntered,
  disabled,
  onPressDigit,
  onPressDelete,
}: Props) {
  const { t, i18n } = useTranslation("transfer");
  const digitKey = (digit: string) => (
    <Pressable
      key={digit}
      accessibilityRole="button"
      accessibilityLabel={digit}
      accessibilityLanguage={i18n.language}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        onPressDigit(digit);
      }}
      style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
    >
      <Text style={styles.keyLabel}>{digit}</Text>
    </Pressable>
  );

  return (
    <View style={styles.keypad}>
      <View
        accessible
        accessibilityLabel={t("keypad_pin.digits_entered", {
          entered: digitsEntered,
          length: pinLength,
        })}
        accessibilityLanguage={i18n.language}
        style={styles.dots}
      >
        {Array.from({ length: pinLength }, (_, position) => (
          <View
            key={position}
            style={[styles.dot, position < digitsEntered && styles.dotFilled]}
          />
        ))}
      </View>
      {DIGIT_ROWS.map((digits) => (
        <View key={digits.join("")} style={styles.row}>
          {digits.map(digitKey)}
        </View>
      ))}
      <View style={styles.row}>
        <View style={styles.key} />
        {digitKey("0")}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("keypad_pin.delete")}
          accessibilityLanguage={i18n.language}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={onPressDelete}
          style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
        >
          <Text aria-hidden style={styles.keyLabel}>
            ⌫
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  keypad: { gap: spacing.sm },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  dot: {
    width: spacing.md,
    height: spacing.md,
    borderRadius: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dotFilled: { backgroundColor: colors.textPrimary },
  row: { flexDirection: "row", gap: spacing.sm },
  key: {
    flex: 1,
    minHeight: minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.sm,
  },
  keyPressed: { backgroundColor: colors.background },
  keyLabel: { ...typography.heading, color: colors.textPrimary },
});

const DIGIT_ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
];
