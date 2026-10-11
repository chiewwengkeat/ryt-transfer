import { ScreensCoveredContext } from "@/shared/hooks/use-is-screen-on-top/use-is-screen-on-top";
import { colors, typography } from "@/shared/theme/theme";
import { use, useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  Text,
  TextStyle,
} from "react-native";

interface Props {
  children: ReactNode;
  autoFocus?: boolean;
  style?: TextStyle;
}
export default function TextHeading({
  children,
  autoFocus = false,
  style: propStyle,
}: Props) {
  const { i18n } = useTranslation();

  const headingRef = useRef<Text>(null);
  const screensCoveredBeforeRef = useRef<boolean>(undefined);
  // The covered signal alone, not the screen's focus: a sheet or a view the root lays over the app draws this outside any screen.
  const isCovered = use(ScreensCoveredContext);

  useEffect(() => {
    const wasCovered = screensCoveredBeforeRef.current;
    screensCoveredBeforeRef.current = isCovered;
    const heading = headingRef.current;
    // Asked beneath the session-ended view, the focus is lost, and nothing reads the heading after sign-in.
    if (!autoFocus || isCovered || heading === null) return;
    if (wasCovered === undefined) {
      AccessibilityInfo.sendAccessibilityEvent(heading, "focus");
      return;
    }
    const timer = setTimeout(
      () => {
        AccessibilityInfo.sendAccessibilityEvent(heading, "focus");
      },
      wasCovered || Platform.OS === "ios" ? READERS_OWN_FOCUS_WAIT_MS : 0,
    );
    return () => {
      clearTimeout(timer);
    };
  }, [autoFocus, isCovered]);

  return (
    <Text
      ref={headingRef}
      accessibilityRole="header"
      accessibilityLanguage={i18n.language}
      // Grown further, a title's longest word outgrows a small phone's line and breaks mid-word.
      maxFontSizeMultiplier={2}
      style={[styles.main, propStyle]}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  main: { ...typography.heading, color: colors.textPrimary },
});

// A screen reader places its own focus up to half a second after what it reads changes, and the later request wins:
// VoiceOver after a page or sheet opens, both readers after the session-ended view lifts.
export const READERS_OWN_FOCUS_WAIT_MS = 1_000;
