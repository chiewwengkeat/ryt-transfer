import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";

import { useGetPrimaryAccount } from "@/domains/account/api/get-primary-account/get-primary-account";
import {
  getTransferLimitsMaintenance,
  useGetTransferLimits,
} from "@/domains/account/api/get-transfer-limits/get-transfer-limits";
import {
  TransportError,
  TransportErrorKind,
} from "@/shared/http/transport-error";
import { formatMoney } from "@/shared/lib/money/money";
import { useTrackScenarioShown } from "@/shared/observability/observability";
import { useIsOffline } from "@/shared/platform/offline";
import { colors, typography } from "@/shared/theme/theme";
import BannerNotice from "@/shared/ui/BannerNotice/BannerNotice";
import ButtonSecondary from "@/shared/ui/ButtonSecondary/ButtonSecondary";
import Card from "@/shared/ui/Card/Card";
import Loader from "@/shared/ui/Loader/Loader";
import TextBody from "@/shared/ui/TextBody/TextBody";

interface Props {
  unexpectedScenario: "start_unexpected" | "amount_unexpected";
}
export default function CardBalance({ unexpectedScenario }: Props) {
  const { t } = useTranslation("account");
  // Only a request that reaches the bank ends offline, so the card keeps asking while it lasts.
  const refetchInterval = useIsOffline() ? 10_000 : false;
  const account = useGetPrimaryAccount({ refetchInterval });
  const limits = useGetTransferLimits({ refetchInterval });
  // Maintenance pauses transfers, not the balance: the balance still shows, and Transfer says why it waits.
  const limitsPausedForMaintenance =
    getTransferLimitsMaintenance(limits.error) !== undefined;
  const failure =
    account.error ?? (limitsPausedForMaintenance ? null : limits.error);
  const failureScenario =
    failure === null
      ? undefined
      : failure instanceof TransportError &&
          (failure.kind === TransportErrorKind.Network ||
            failure.kind === TransportErrorKind.Timeout ||
            (failure.kind === TransportErrorKind.Http &&
              (failure.status ?? 0) >= 500))
        ? "balance_unavailable"
        : unexpectedScenario;
  useTrackScenarioShown(
    failureScenario !== undefined
      ? `transfer.${failureScenario}`
      : limitsPausedForMaintenance
        ? "transfer.under_maintenance"
        : account.data !== undefined && limits.isSuccess
          ? "transfer.balance_and_limit_shown"
          : undefined,
  );

  if (failureScenario !== undefined) {
    return (
      <Card>
        <BannerNotice
          tone="negative"
          message={t(`common.${failureScenario}.body`)}
        />
        <ButtonSecondary
          label={t(`common.${failureScenario}.retry`)}
          onPress={() => {
            void account.refetch();
            void limits.refetch();
          }}
        />
      </Card>
    );
  }
  if (account.data === undefined || limits.isPending) return <Loader />;

  return (
    <Card>
      <View accessible>
        <TextBody tone="secondary">{t("card_balance.label")}</TextBody>
        <Text style={styles.balance}>{formatMoney(account.data.balance)}</Text>
      </View>
      {limits.isSuccess && (
        <TextBody>
          {t("common.balance_and_limit_shown.remaining_today", {
            amount: formatMoney(limits.data.remainingToday),
          })}
        </TextBody>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  balance: { ...typography.heading, color: colors.textPrimary },
});
