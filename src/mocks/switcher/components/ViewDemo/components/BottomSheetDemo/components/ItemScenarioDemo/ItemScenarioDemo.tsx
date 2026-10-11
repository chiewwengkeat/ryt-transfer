import {
  colors,
  minTouchTarget,
  spacing,
  typography,
} from "@/shared/theme/theme";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";

interface Props {
  label: string;
  checked: boolean;
  onPress: () => void;
}
export default function ItemScenarioDemo({ label, checked, onPress }: Props) {
  const { i18n } = useTranslation();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityLanguage={i18n.language}
      accessibilityState={{ checked }}
      onPress={onPress}
      style={styles.main}
    >
      <View style={[styles.mark, checked && styles.markChecked]} />
      <Text style={styles.textLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  main: {
    minHeight: minTouchTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  mark: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
  },
  markChecked: { borderWidth: 6, borderColor: colors.accent },
  textLabel: { ...typography.body, flex: 1, color: colors.textPrimary },
});
