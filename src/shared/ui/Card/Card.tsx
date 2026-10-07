import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { colors, radii, spacing } from "@/shared/theme/theme";

interface Props {
  children: ReactNode;
}
export default function Card({ children }: Props) {
  return <View style={styles.card}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
});
