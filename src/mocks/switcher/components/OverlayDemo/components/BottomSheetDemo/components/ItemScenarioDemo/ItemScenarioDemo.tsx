import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  colors,
  minTouchTarget,
  spacing,
  typography,
} from "@/shared/theme/theme";

interface Props {
  label: string;
  checked: boolean;
  onPress: () => void;
}
export default function ItemScenarioDemo({ label, checked, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      onPress={onPress}
      style={styles.item}
    >
      <View style={[styles.mark, checked && styles.markChecked]} />
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  item: {
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
  label: { ...typography.body, flex: 1, color: colors.textPrimary },
});
