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

import { useListBanks } from "@/domains/transfer/api/list-banks/list-banks";
import {
  colors,
  minTouchTarget,
  radii,
  spacing,
  typography,
} from "@/shared/theme/theme";
import TextBody from "@/shared/ui/TextBody/TextBody";

import BottomSheetBank from "./components/BottomSheetBank/BottomSheetBank";

interface Props {
  bankCode: string | undefined;
  onBankChosen: (bankCode: string) => void;
  error?: string;
}
export default function FieldBank({ bankCode, onBankChosen, error }: Props) {
  const { t } = useTranslation("transfer");
  const banks = useListBanks();
  const [bankSheetOpen, setBankSheetOpen] = useState(false);
  const bankName =
    bankCode === undefined ? undefined : banks.data?.get(bankCode)?.name;
  // A screen reader stays on Continue, so an error that appears here would go unheard.
  useEffect(() => {
    if (error !== undefined) AccessibilityInfo.announceForAccessibility(error);
  }, [error]);

  return (
    <View style={styles.container}>
      <View aria-hidden>
        <TextBody strong>{t("recipient.bank_label")}</TextBody>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("recipient.bank_label")}
        accessibilityValue={{ text: bankName }}
        accessibilityHint={error}
        onPress={() => {
          // This tap lands with the keyboard up; left up, it would cover Continue after a pick.
          Keyboard.dismiss();
          setBankSheetOpen(true);
        }}
        style={[styles.field, error !== undefined && styles.fieldInvalid]}
      >
        <Text style={bankName === undefined ? styles.placeholder : styles.bank}>
          {bankName ?? t("recipient.bank_placeholder")}
        </Text>
      </Pressable>
      {error !== undefined && <TextBody tone="negative">{error}</TextBody>}
      {bankSheetOpen && (
        <BottomSheetBank
          onBankChosen={(chosenBankCode) => {
            setBankSheetOpen(false);
            onBankChosen(chosenBankCode);
          }}
          onClose={() => {
            setBankSheetOpen(false);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  field: {
    minHeight: minTouchTarget,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderRadius: radii.sm,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  fieldInvalid: { borderColor: colors.negative, borderWidth: 2 },
  bank: { ...typography.body, color: colors.textPrimary },
  placeholder: { ...typography.body, color: colors.textSecondary },
});
