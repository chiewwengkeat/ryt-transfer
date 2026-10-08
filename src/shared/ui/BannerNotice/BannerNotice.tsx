import { useIsFocused } from "expo-router";
import { useEffect, useRef } from "react";
import { AccessibilityInfo, StyleSheet, View } from "react-native";

import { colors, radii, spacing } from "@/shared/theme/theme";
import TextBody from "@/shared/ui/TextBody/TextBody";

interface Props {
  message: string;
  tone?: "warning" | "negative";
}
export default function BannerNotice({ message, tone = "warning" }: Props) {
  const screenFocused = useIsFocused();
  const announcedMessageRef = useRef<string>(undefined);
  // Announced outright, which iOS needs; a live region as well could make TalkBack say it twice.
  // Once per message, and only on top: a covered screen stays mounted and would talk over the one above it.
  useEffect(() => {
    if (!screenFocused || announcedMessageRef.current === message) return;
    announcedMessageRef.current = message;
    AccessibilityInfo.announceForAccessibility(message);
  }, [message, screenFocused]);

  return (
    <View accessibilityRole="alert" style={[styles.banner, styles[tone]]}>
      <TextBody>{message}</TextBody>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    padding: spacing.md,
    borderLeftWidth: spacing.xs,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
  },
  warning: { borderLeftColor: colors.warning },
  negative: { borderLeftColor: colors.negative },
});
