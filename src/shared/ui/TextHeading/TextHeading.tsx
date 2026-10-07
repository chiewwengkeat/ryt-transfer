import type { ReactNode } from "react";
import { StyleSheet, Text } from "react-native";

import { colors, typography } from "@/shared/theme/theme";

interface Props {
  children: ReactNode;
}
export default function TextHeading({ children }: Props) {
  return (
    <Text accessibilityRole="header" style={styles.heading}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  heading: { ...typography.heading, color: colors.textPrimary },
});
