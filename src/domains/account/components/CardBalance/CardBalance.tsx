import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";

import { useGetPrimaryAccount } from "@/domains/account/api/get-primary-account/get-primary-account";
import {
  getTransferLimitsMaintenance,
  useGetTransferLimits,
} from "@/domains/account/api/get-transfer-limits/get-transfer-limits";
import { useIsScreenOnTop } from "@/shared/hooks/use-is-screen-on-top";
import {
  isSessionEndFailure,
  isUnansweredReadFailure,
} from "@/shared/http/transport-error";
import { formatMoney } from "@/shared/lib/money/money";
import { useIsOffline } from "@/shared/platform/offline";
import { colors, spacing, typography } from "@/shared/theme/theme";
import BannerAction from "@/shared/ui/BannerAction/BannerAction";
import Card from "@/shared/ui/Card/Card";
import Loader from "@/shared/ui/Loader/Loader";
import TextBody from "@/shared/ui/TextBody/TextBody";

interface Props {
  unexpectedScenario: "start_unexpected" | "amount_unexpected";
  onScenarioShown: (scenario: string) => void;
}
export default function CardBalance({
  unexpectedScenario,
  onScenarioShown,
}: Props) {
  const { t, i18n } = useTranslation("account");
  // Only a request that reaches the bank ends offline, so the card keeps asking while it lasts.
  const refetchInterval = useIsOffline() ? 10_000 : false;
  const account = useGetPrimaryAccount({ refetchInterval });
  const limits = useGetTransferLimits({ refetchInterval });
  // Maintenance pauses transfers, not the balance: the balance still shows, and Transfer says why it waits.
  const limitsPausedForMaintenance =
    getTransferLimitsMaintenance(limits.error) !== undefined;
  const [failureBeforeReRead, setFailureBeforeReRead] = useState<Error | null>(
    null,
  );
  // A re-read of a read that never answered clears its error until it lands: kept, the failure stays one showing.
  const failure =
    account.error ??
    (limitsPausedForMaintenance ? null : limits.error) ??
    (account.fetchStatus !== "idle" || limits.fetchStatus !== "idle"
      ? failureBeforeReRead
      : null);
  if (failure !== failureBeforeReRead) setFailureBeforeReRead(failure);
  const failureScenario =
    failure === null
      ? undefined
      : isUnansweredReadFailure(failure)
        ? "balance_unavailable"
        : unexpectedScenario;
  // After sign-in this stays shown until the card's reads answer again.
  const failureIsSessionEnd = isSessionEndFailure(failure);
  const shownScenario = failureIsSessionEnd
    ? undefined
    : failureScenario !== undefined
      ? `transfer.${failureScenario}`
      : limitsPausedForMaintenance
        ? "transfer.under_maintenance"
        : account.data !== undefined && limits.isSuccess
          ? "transfer.balance_and_limit_shown"
          : undefined;
  const screenOnTop = useIsScreenOnTop();
  const reportedScenarioRef = useRef<string>(undefined);
  // useTrackScenarioShown's rule, which an account component may not import: only on top, once per showing.
  useEffect(() => {
    if (shownScenario === undefined) reportedScenarioRef.current = undefined;
    else if (screenOnTop && reportedScenarioRef.current !== shownScenario) {
      reportedScenarioRef.current = shownScenario;
      onScenarioShown(shownScenario);
    }
  }, [shownScenario, screenOnTop, onScenarioShown]);

  if (failureScenario !== undefined) {
    return (
      <Card>
        <BannerAction
          tone="negative"
          announce={!failureIsSessionEnd}
          message={t(`common.${failureScenario}.body`)}
          action={{
            label: t(`common.${failureScenario}.retry`),
            onPress: () => {
              // Pressed, the answer is a new showing: said and reported even when it fails the same way.
              setFailureBeforeReRead(null);
              void account.refetch();
              void limits.refetch();
            },
          }}
        />
      </Card>
    );
  }
  if (account.data === undefined || limits.isPending) return <Loader />;

  return (
    <Card styles={{ main: styles.main }}>
      <View
        accessible
        // The group, not its texts: a screen reader reads the group as one element, in the group's language.
        accessibilityLanguage={i18n.language}
      >
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
  main: {
    padding: spacing.lg,
  },
  balance: { ...typography.heading, color: colors.textPrimary },
});
