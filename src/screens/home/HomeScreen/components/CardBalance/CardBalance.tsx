import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";

import { useGetPrimaryAccount } from "@/domains/account/api/get-primary-account/get-primary-account";
import { useGetTransferLimits } from "@/domains/account/api/get-transfer-limits/get-transfer-limits";
import { formatMoney } from "@/shared/lib/money/money";
import { colors, typography } from "@/shared/theme/theme";
import BannerNotice from "@/shared/ui/BannerNotice/BannerNotice";
import ButtonSecondary from "@/shared/ui/ButtonSecondary/ButtonSecondary";
import Card from "@/shared/ui/Card/Card";
import Loader from "@/shared/ui/Loader/Loader";
import TextBody from "@/shared/ui/TextBody/TextBody";

export default function CardBalance() {
  const { t } = useTranslation(["home", "transfer"]);
  const account = useGetPrimaryAccount();
  const limits = useGetTransferLimits();

  if (account.isError || limits.isError)
    return (
      <Card>
        <BannerNotice
          tone="negative"
          message={t("transfer:common.start_unexpected.body")}
        />
        <ButtonSecondary
          label={t("transfer:common.start_unexpected.retry")}
          onPress={() => {
            void account.refetch();
            void limits.refetch();
          }}
        />
      </Card>
    );
  if (account.isPending || limits.isPending) return <Loader />;

  return (
    <Card>
      <View accessible>
        <TextBody tone="secondary">{t("card_balance.label")}</TextBody>
        <Text style={styles.balance}>{formatMoney(account.data.balance)}</Text>
      </View>
      <TextBody>
        {t("transfer:common.balance_and_limit_shown.remaining_today", {
          amount: formatMoney(limits.data.remainingToday),
        })}
      </TextBody>
    </Card>
  );
}

const styles = StyleSheet.create({
  balance: { ...typography.heading, color: colors.textPrimary },
});
