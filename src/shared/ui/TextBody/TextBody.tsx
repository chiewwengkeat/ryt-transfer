import { colors, typography } from "@/shared/theme/theme";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, TextStyle } from "react-native";

interface Props {
  children: ReactNode;
  tone?: "primary" | "secondary" | "negative" | "warning";
  strong?: boolean;
  alignEnd?: boolean;
  alignCenter?: boolean;
  style?: TextStyle;
}
export default function TextBody({
  children,
  tone = "primary",
  strong = false,
  alignEnd = false,
  alignCenter = false,
  style: propStyle,
}: Props) {
  const { i18n } = useTranslation();
  return (
    <Text
      accessibilityLanguage={i18n.language}
      style={[
        styles.body,
        styles[tone],
        strong && styles.strong,
        alignEnd && styles.alignEnd,
        alignCenter && styles.alignCenter,
        propStyle,
      ]}
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
  warning: { color: colors.warning },
  strong: { fontWeight: "600" },
  alignEnd: { textAlign: "right" },
  alignCenter: { textAlign: "center" },
});
