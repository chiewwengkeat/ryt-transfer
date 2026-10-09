import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text } from "react-native";

import { useListBanks } from "@/domains/transfer/api/list-banks/list-banks";
import BannerRecipientUnexpected from "@/screens/transfer/TransferRecipientScreen/components/BannerRecipientUnexpected/BannerRecipientUnexpected";
import { useIsOffline } from "@/shared/platform/offline";
import { colors, minTouchTarget, typography } from "@/shared/theme/theme";
import BannerNotice from "@/shared/ui/BannerNotice/BannerNotice";
import BottomSheetFrame from "@/shared/ui/BottomSheetFrame/BottomSheetFrame";
import Loader from "@/shared/ui/Loader/Loader";

interface Props {
  onBankChosen: (bankCode: string) => void;
  onClose: () => void;
}
export default function BottomSheetBank({ onBankChosen, onClose }: Props) {
  const { t, i18n } = useTranslation("transfer");
  const banks = useListBanks();
  // The shell's offline notice already explains a list that cannot load.
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
      {banks.isError ? (
        !offline && (
          <BannerRecipientUnexpected
            failure={banks.error}
            onRetry={() => {
              void banks.refetch();
            }}
          />
        )
      ) : matchingBanks === undefined ? (
        <Loader />
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
            style={styles.bank}
          >
            <Text style={styles.bankName}>{bank.name}</Text>
          </Pressable>
        ))
      )}
    </BottomSheetFrame>
  );
}

const styles = StyleSheet.create({
  bank: { minHeight: minTouchTarget, justifyContent: "center" },
  bankName: { ...typography.body, color: colors.textPrimary },
});
