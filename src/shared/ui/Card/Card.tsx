import { colors, radii, shadows, spacing } from "@/shared/theme/theme";
import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, View } from "react-native";

interface Props {
  children: ReactNode;
  style?: ViewStyle;
  styles?: {
    main?: StyleProp<ViewStyle>;
  };
}
export default function Card({
  children,
  style: propStyle,
  styles: propStyles,
}: Props) {
  return (
    <View style={[styles.main, propStyle, propStyles?.main]}>{children}</View>
  );
}

const styles = StyleSheet.create({
  main: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    boxShadow: shadows.sm,
  },
});
