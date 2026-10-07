import { StyleSheet, View } from "react-native";

import { colors } from "@/shared/theme/theme";

interface Props {
  expanded: boolean;
}
export default function IconChevron({ expanded }: Props) {
  return (
    <View
      aria-hidden
      style={[styles.chevron, expanded ? styles.expanded : styles.collapsed]}
    />
  );
}

const styles = StyleSheet.create({
  chevron: {
    width: 8,
    height: 8,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderColor: colors.textSecondary,
  },
  expanded: { transform: [{ rotate: "45deg" }] },
  collapsed: { transform: [{ rotate: "-45deg" }] },
});
