import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, spacing } from "@/shared/theme/theme";

interface Props {
  children: ReactNode;
  footer?: ReactNode;
}
export default function ViewScreenFrame({ children, footer }: Props) {
  const { bottom } = useSafeAreaInsets();
  return (
    <View style={styles.frame}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          footer === undefined && { paddingBottom: spacing.lg + bottom },
        ]}
      >
        {children}
      </ScrollView>
      {footer !== undefined && (
        <View style={[styles.footer, { paddingBottom: spacing.md + bottom }]}>
          {footer}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, backgroundColor: colors.background },
  content: { gap: spacing.md, padding: spacing.md },
  footer: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    backgroundColor: colors.background,
  },
});
