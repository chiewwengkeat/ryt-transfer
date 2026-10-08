import { useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AccessibilityInfo, StyleSheet, Text } from "react-native";

import { colors, typography } from "@/shared/theme/theme";

interface Props {
  children: ReactNode;
  autoFocus?: boolean;
}
export default function TextHeading({ children, autoFocus = false }: Props) {
  const { i18n } = useTranslation();
  const headingRef = useRef<Text>(null);
  useEffect(() => {
    if (autoFocus && headingRef.current !== null)
      AccessibilityInfo.sendAccessibilityEvent(headingRef.current, "focus");
  }, [autoFocus]);

  return (
    <Text
      ref={headingRef}
      accessibilityRole="header"
      accessibilityLanguage={i18n.language}
      style={styles.heading}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  heading: { ...typography.heading, color: colors.textPrimary },
});
