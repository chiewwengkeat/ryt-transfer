import { useListBanks } from "@/domains/transfer/api/list-banks/list-banks";
import BannerRecipientUnexpected from "@/screens/transfer/TransferRecipientScreen/components/BannerRecipientUnexpected/BannerRecipientUnexpected";
import { useRetryKeepingFailure } from "@/shared/hooks/use-retry-keeping-failure/use-retry-keeping-failure";
import { useIsOffline } from "@/shared/http/offline/offline";
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
          setBankSheetOpen(true);
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

interface BottomSheetBankProps {
  onBankChosen: (bankCode: string) => void;
  onClose: () => void;
}
function BottomSheetBank({ onBankChosen, onClose }: BottomSheetBankProps) {
  const { t, i18n } = useTranslation("transfer");
  const banks = useListBanks();
  const { failure: banksFailure, retry: readBanksAgain } =
    useRetryKeepingFailure(banks.error, () => banks.refetch());
  // Continue's offline line sits under the sheet, so the sheet says why its list waits.
  const offline = useIsOffline();
  const [bankSearch, setBankSearch] = useState("");
  const matchingBanks =
    banks.data &&
    [...banks.data.values()].filter((bank) =>
      bank.name.toLowerCase().includes(bankSearch.trim().toLowerCase()),
    );

  return (
    <BottomSheetFrame
      title={t("bottom_sheet_bank.title")}
      closeLabel={t("common.close_sheet")}
      onClose={onClose}
      searchField={{
        label: t("bottom_sheet_bank.search_label"),
        value: bankSearch,
        onChangeText: setBankSearch,
      }}
    >
      {matchingBanks === undefined ? (
        offline && (!banks.isFetching || banksFailure !== null) ? (
          <BannerAction
            // Remounted per failure, so a press that finds no network again says so again.
            key={banks.errorUpdatedAt}
            message={t("common.offline.notice")}
            action={{
              label: t("bottom_sheet_bank.retry"),
              onPress: readBanksAgain,
            }}
          />
        ) : banksFailure !== null ? (
          <BannerRecipientUnexpected
            key={banks.errorUpdatedAt}
            failure={banksFailure}
            onRetry={readBanksAgain}
          />
        ) : (
          <Loader />
        )
      ) : matchingBanks.length === 0 ? (
        <BannerNotice message={t("bottom_sheet_bank.no_match")} />
      ) : (
        matchingBanks.map((bank) => (
          <Pressable
            key={bank.bankCode}
            accessibilityRole="button"
            accessibilityLanguage={i18n.language}
            onPress={() => {
              onBankChosen(bank.bankCode);
            }}
            style={bottomSheetBankStyles.btnBank}
          >
            <Text style={bottomSheetBankStyles.textBankName}>{bank.name}</Text>
          </Pressable>
        ))
      )}
    </BottomSheetFrame>
  );
}

const bottomSheetBankStyles = StyleSheet.create({
  btnBank: { minHeight: minTouchTarget, justifyContent: "center" },
  textBankName: { ...typography.body, color: colors.textPrimary },
});
