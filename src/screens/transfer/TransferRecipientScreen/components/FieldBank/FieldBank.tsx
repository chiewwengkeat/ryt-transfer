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
import BannerRecipientUnexpected from "@/screens/transfer/TransferRecipientScreen/components/BannerRecipientUnexpected/BannerRecipientUnexpected";
import { useIsOffline } from "@/shared/platform/offline";
import {
  colors,
  minTouchTarget,
  radii,
  spacing,
  typography,
} from "@/shared/theme/theme";
import BannerAction from "@/shared/ui/BannerAction/BannerAction";
import BannerNotice from "@/shared/ui/BannerNotice/BannerNotice";
import BottomSheetFrame from "@/shared/ui/BottomSheetFrame/BottomSheetFrame";
import Loader from "@/shared/ui/Loader/Loader";
import TextBody from "@/shared/ui/TextBody/TextBody";

interface Props {
  bankCode: string | undefined;
  onBankChosen: (bankCode: string) => void;
  error?: string;
}
export default function FieldBank({ bankCode, onBankChosen, error }: Props) {
  const { t, i18n } = useTranslation("transfer");
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
        accessibilityLanguage={i18n.language}
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

interface BottomSheetBankProps {
  onBankChosen: (bankCode: string) => void;
  onClose: () => void;
}
function BottomSheetBank({ onBankChosen, onClose }: BottomSheetBankProps) {
  const { t, i18n } = useTranslation("transfer");
  const banks = useListBanks();
  // The shell's offline notice sits under the sheet, so the sheet says why its list waits.
  const offline = useIsOffline();
  const [bankSearch, setBankSearch] = useState("");
  const matchingBanks =
    banks.data &&
    [...banks.data.values()].filter((bank) =>
      bank.name.toLowerCase().includes(bankSearch.trim().toLowerCase()),
    );

  return (
    <BottomSheetFrame
      title={t("recipient.bank_sheet_title")}
      closeLabel={t("recipient.close_sheet")}
      onClose={onClose}
      searchField={{
        label: t("recipient.bank_search_label"),
        value: bankSearch,
        onChangeText: setBankSearch,
      }}
    >
      {matchingBanks === undefined ? (
        offline && !banks.isFetching ? (
          <BannerAction
            message={t("common.offline.notice")}
            action={{
              label: t("common.recipient_unexpected.retry"),
              onPress: () => {
                void banks.refetch();
              },
            }}
          />
        ) : banks.isError ? (
          <BannerRecipientUnexpected
            failure={banks.error}
            onRetry={() => {
              void banks.refetch();
            }}
          />
        ) : (
          <Loader />
        )
      ) : matchingBanks.length === 0 ? (
        <BannerNotice message={t("recipient.bank_no_match")} />
      ) : (
        matchingBanks.map((bank) => (
          <Pressable
            key={bank.bankCode}
            accessibilityRole="button"
            accessibilityLanguage={i18n.language}
            onPress={() => {
              onBankChosen(bank.bankCode);
            }}
            style={bottomSheetBankStyles.bank}
          >
            <Text style={bottomSheetBankStyles.bankName}>{bank.name}</Text>
          </Pressable>
        ))
      )}
    </BottomSheetFrame>
  );
}

const bottomSheetBankStyles = StyleSheet.create({
  bank: { minHeight: minTouchTarget, justifyContent: "center" },
  bankName: { ...typography.body, color: colors.textPrimary },
});
