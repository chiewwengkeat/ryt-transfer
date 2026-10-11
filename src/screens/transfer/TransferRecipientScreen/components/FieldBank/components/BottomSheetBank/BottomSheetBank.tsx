import { useListBanks } from "@/domains/transfer/api/list-banks/list-banks";
import BannerRecipientUnexpected from "@/screens/transfer/TransferRecipientScreen/components/BannerRecipientUnexpected/BannerRecipientUnexpected";
import { useQueryError } from "@/shared/hooks/use-query-error/use-query-error";
import { useIsOffline } from "@/shared/http/offline/offline";
import { colors, minTouchTarget, typography } from "@/shared/theme/theme";
import BannerAction from "@/shared/ui/BannerAction/BannerAction";
import BannerNotice from "@/shared/ui/BannerNotice/BannerNotice";
import BottomSheetFrame from "@/shared/ui/BottomSheetFrame/BottomSheetFrame";
import Loader from "@/shared/ui/Loader/Loader";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text } from "react-native";

interface Props {
  onBankChosen: (bankCode: string) => void;
  onClose: () => void;
}
export default function BottomSheetBank({ onBankChosen, onClose }: Props) {
  const { t, i18n } = useTranslation("transfer");
  const banks = useListBanks();
  const banksFailure = useQueryError(banks.error, banks.fetchStatus !== "idle");
  const readBanksAgain = () => banks.refetch({ cancelRefetch: false });
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
            style={styles.btnBank}
          >
            <Text style={styles.textBankName}>{bank.name}</Text>
          </Pressable>
        ))
      )}
    </BottomSheetFrame>
  );
}

const styles = StyleSheet.create({
  btnBank: { minHeight: minTouchTarget, justifyContent: "center" },
  textBankName: { ...typography.body, color: colors.textPrimary },
});
