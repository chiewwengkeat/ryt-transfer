import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text } from "react-native";

import { colors, typography } from "@/shared/theme/theme";

interface Props {
  children: ReactNode;
  tone?: "primary" | "secondary" | "negative";
  strong?: boolean;
}
export default function TextBody({
  children,
  tone = "primary",
  strong = false,
}: Props) {
  const { i18n } = useTranslation();
  return (
    <Text
      accessibilityLanguage={i18n.language}
      style={[styles.body, styles[tone], strong && styles.strong]}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  body: typography.body,
  primary: { color: colors.textPrimary },
  secondary: { color: colors.textSecondary },
  negative: { color: colors.negative },
  strong: { fontWeight: "600" },
});
