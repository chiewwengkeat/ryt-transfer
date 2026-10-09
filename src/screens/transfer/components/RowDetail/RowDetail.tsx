import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";

import { spacing } from "@/shared/theme/theme";
import TextBody from "@/shared/ui/TextBody/TextBody";

interface Props {
  label: string;
  value: string;
}
export default function RowDetail({ label, value }: Props) {
  const { i18n } = useTranslation();
  return (
    <View
      accessible
      // The row, not its texts: a screen reader reads the row as one element, in the row's language.
      accessibilityLanguage={i18n.language}
      style={styles.row}
    >
      <TextBody tone="secondary">{label}</TextBody>
      <TextBody strong>{value}</TextBody>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    columnGap: spacing.md,
  },
});
