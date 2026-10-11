import { RecipientIdType } from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import {
  colors,
  minTouchTarget,
  radii,
  spacing,
  typography,
} from "@/shared/theme/theme";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";

interface Props {
  idType: RecipientIdType;
  onIdTypeChange: (idType: RecipientIdType) => void;
}
export default function ChipIdType({ idType, onIdTypeChange }: Props) {
  const { t, i18n } = useTranslation("transfer");
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t("chip_id_type.label")}
      style={styles.chips}
    >
      {[
        RecipientIdType.Mobile,
        RecipientIdType.Nric,
        RecipientIdType.AccountNumber,
        RecipientIdType.Passport,
        RecipientIdType.Brn,
        RecipientIdType.ArmyPolice,
      ].map((chipIdType) => (
        <Pressable
          key={chipIdType}
          accessibilityRole="radio"
          accessibilityLanguage={i18n.language}
          accessibilityState={{ checked: chipIdType === idType }}
          onPress={() => {
            onIdTypeChange(chipIdType);
          }}
          style={[styles.chip, chipIdType === idType && styles.chipChosen]}
        >
          <Text
            style={[
              styles.chipLabel,
              chipIdType === idType && styles.chipLabelChosen,
            ]}
          >
            {t(
              `chip_id_type.id_type.${chipIdType.toLowerCase() as Lowercase<RecipientIdType>}`,
            )}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    minHeight: minTouchTarget,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  chipChosen: { borderColor: colors.accent, backgroundColor: colors.accent },
  chipLabel: { ...typography.label, color: colors.textPrimary },
  chipLabelChosen: { color: colors.onAccent },
});
