import { useEffect } from "react";
import { AccessibilityInfo, StyleSheet, View } from "react-native";

import { colors, radii, spacing } from "@/shared/theme/theme";
import TextBody from "@/shared/ui/TextBody/TextBody";

interface Props {
  message: string;
  tone?: "warning" | "negative";
}
export default function BannerNotice({ message, tone = "warning" }: Props) {
  // Announced outright, which iOS needs; a live region as well could make TalkBack say it twice.
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(message);
  }, [message]);

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
