import { useEffect, useRef, type ReactNode } from "react";
import { AccessibilityInfo, StyleSheet, Text } from "react-native";

import { colors, typography } from "@/shared/theme/theme";

interface Props {
  children: ReactNode;
  autoFocus?: boolean;
}
export default function TextHeading({ children, autoFocus = false }: Props) {
  const headingRef = useRef<Text>(null);
  useEffect(() => {
    if (autoFocus && headingRef.current !== null)
      AccessibilityInfo.sendAccessibilityEvent(headingRef.current, "focus");
  }, [autoFocus]);

  return (
    <Text ref={headingRef} accessibilityRole="header" style={styles.heading}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  heading: { ...typography.heading, color: colors.textPrimary },
});
