import { use, useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AccessibilityInfo, StyleSheet, Text } from "react-native";

import { ScreensCoveredContext } from "@/shared/hooks/use-is-screen-on-top";
import { colors, typography } from "@/shared/theme/theme";

interface Props {
  children: ReactNode;
  autoFocus?: boolean;
}
export default function TextHeading({ children, autoFocus = false }: Props) {
  const { i18n } = useTranslation();
  const headingRef = useRef<Text>(null);
  // The covered signal alone, not the screen's focus: a sheet or a shell view draws this outside any screen.
  const screensCovered = use(ScreensCoveredContext);
  // Asked beneath the session-ended view, the focus is lost, and nothing reads the heading after sign-in.
  useEffect(() => {
    if (autoFocus && !screensCovered && headingRef.current !== null)
      AccessibilityInfo.sendAccessibilityEvent(headingRef.current, "focus");
  }, [autoFocus, screensCovered]);

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
