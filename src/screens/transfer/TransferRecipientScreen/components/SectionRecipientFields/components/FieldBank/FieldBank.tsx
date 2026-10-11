import { useListBanks } from "@/domains/transfer/api/list-banks/list-banks";
import {
  colors,
  minTouchTarget,
  radii,
  spacing,
  typography,
} from "@/shared/theme/theme";
import TextBody from "@/shared/ui/TextBody/TextBody";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AccessibilityInfo,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import BottomSheetBank from "./components/BottomSheetBank/BottomSheetBank";

interface Props {
  bankCode: string | undefined;
  onBankChosen: (bankCode: string) => void;
  error?: string;
}
export default function FieldBank({ bankCode, onBankChosen, error }: Props) {
  const { t, i18n } = useTranslation("transfer");
  const [isBankSheetOpen, setIsBankSheetOpen] = useState(false);

  const banks = useListBanks();

  const bankName =
    bankCode === undefined ? undefined : banks.data?.get(bankCode)?.name;

  // A screen reader stays on Continue, so an error that appears here would go unheard.
  useEffect(() => {
    if (error !== undefined) AccessibilityInfo.announceForAccessibility(error);
  }, [error]);

  return (
    <View style={styles.main}>
      <View aria-hidden>
        <TextBody strong>{t("field_bank.label")}</TextBody>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("field_bank.label")}
        accessibilityLanguage={i18n.language}
        accessibilityValue={{ text: bankName }}
        accessibilityHint={error}
        onPress={() => {
          // This tap lands with the keyboard up; left up, it would cover Continue after a pick.
          Keyboard.dismiss();
          setIsBankSheetOpen(true);
        }}
        style={[styles.btnField, error !== undefined && styles.btnFieldInvalid]}
      >
        <Text
          style={
            bankName === undefined ? styles.textPlaceholder : styles.textBank
          }
        >
          {bankName ?? t("field_bank.placeholder")}
        </Text>
      </Pressable>
      {error !== undefined && <TextBody tone="negative">{error}</TextBody>}
      {isBankSheetOpen && (
        <BottomSheetBank
          onBankChosen={(chosenBankCode) => {
            setIsBankSheetOpen(false);
            onBankChosen(chosenBankCode);
          }}
          onClose={() => {
            setIsBankSheetOpen(false);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  main: { gap: spacing.xs },
  btnField: {
    minHeight: minTouchTarget,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderRadius: radii.sm,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  btnFieldInvalid: { borderColor: colors.negative, borderWidth: 2 },
  textBank: { ...typography.body, color: colors.textPrimary },
  textPlaceholder: { ...typography.body, color: colors.textSecondary },
});
