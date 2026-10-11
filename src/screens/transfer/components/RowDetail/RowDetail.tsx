import { spacing } from "@/shared/theme/theme";
import TextBody from "@/shared/ui/TextBody/TextBody";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";

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
      style={styles.main}
    >
      <View style={styles.label}>
        <TextBody tone="secondary">{label}</TextBody>
      </View>
      <View style={styles.value}>
        <TextBody strong alignEnd>
          {value}
        </TextBody>
      </View>
    </View>
  );
}

// Columns sized by the row, never by their text: Android 15 lays a line out by its glyphs' ink, which on
// some system fonts is wider than React Native measured, so a box sized to its own text wraps inside itself.
const styles = StyleSheet.create({
  main: { flexDirection: "row", flexWrap: "wrap", columnGap: spacing.sm },
  label: { flex: 1, flexShrink: 0, minWidth: "40%" },
  value: { flex: 1.2, flexShrink: 0, minWidth: "40%" },
});
