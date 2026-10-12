import { spacing, typography } from "@/shared/theme/theme";
import type { ReactElement, ReactNode } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";

interface Props {
  children: ReactNode;
  amount: ReactElement | null;
  columnGap: number;
}
export default function ViewAmountWrap({ children, amount, columnGap }: Props) {
  const { fontScale } = useWindowDimensions();

  return (
    <View style={[styles.main, { columnGap }]}>
      <View
        style={[
          styles.start,
          // Seven ems hold a long word such as "Unsuccessful" or "Yesterday": an amount that would leave less wraps to its own line.
          { flexBasis: 7 * typography.body.fontSize * fontScale },
        ]}
      >
        {children}
      </View>
      {amount && <View style={styles.amount}>{amount}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  main: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    rowGap: spacing.xs,
  },
  start: { flexGrow: 1, flexShrink: 1 },
  // Shrinkable so the start's seven ems count: Yoga ignores a lone flexible child's basis.
  amount: { flexShrink: 1 },
});
