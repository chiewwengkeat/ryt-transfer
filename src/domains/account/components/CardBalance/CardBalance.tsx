import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";

import { useGetPrimaryAccount } from "@/domains/account/api/get-primary-account/get-primary-account";
import {
  getTransferLimitsMaintenance,
  useGetTransferLimits,
} from "@/domains/account/api/get-transfer-limits/get-transfer-limits";
import { useIsScreenOnTop } from "@/shared/hooks/use-is-screen-on-top/use-is-screen-on-top";
import {
  isSessionEndFailure,
  TransportError,
  TransportErrorKind,
} from "@/shared/http/transport-error/transport-error";
import { formatMoney } from "@/shared/lib/money/money";
import { useIsOffline } from "@/shared/platform/offline/offline";
import { colors, spacing, typography } from "@/shared/theme/theme";
import BannerAction from "@/shared/ui/BannerAction/BannerAction";
import Card from "@/shared/ui/Card/Card";
import Loader from "@/shared/ui/Loader/Loader";
import TextBody from "@/shared/ui/TextBody/TextBody";

interface Props {
  failureWords: Record<
    "unavailable" | "unexpected",
    { body: string; retry: string }
  >;
  onLoaded: () => void;
  onFailed: (failure: keyof Props["failureWords"]) => void;
  onUnderMaintenance: () => void;
}
export default function CardBalance({
  failureWords,
  onLoaded,
  onFailed,
  onUnderMaintenance,
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
  const shownFailure =
    failure === null
      ? undefined
      : failure instanceof TransportError &&
          (failure.kind === TransportErrorKind.Network ||
            failure.kind === TransportErrorKind.Timeout ||
            (failure.kind === TransportErrorKind.Http &&
              (failure.status ?? 0) >= 500))
        ? "unavailable"
        : "unexpected";
  // After sign-in this stays shown until the card's reads answer again.
  const failureIsSessionEnd = isSessionEndFailure(failure);
  const shown = failureIsSessionEnd
    ? undefined
    : (shownFailure ??
      (limitsPausedForMaintenance
        ? "under_maintenance"
        : account.data !== undefined && limits.isSuccess
          ? "loaded"
          : undefined));
  const screenOnTop = useIsScreenOnTop();
  const reportedShownRef = useRef<typeof shown>(undefined);
  // useTrackScenarioShown's rule, which an account component may not import: only on top, once per showing.
  useEffect(() => {
    if (shown === undefined) reportedShownRef.current = undefined;
    else if (screenOnTop && reportedShownRef.current !== shown) {
      reportedShownRef.current = shown;
      if (shown === "loaded") onLoaded();
      else if (shown === "under_maintenance") onUnderMaintenance();
      else onFailed(shown);
    }
  }, [shown, screenOnTop, onLoaded, onFailed, onUnderMaintenance]);

  if (shownFailure !== undefined) {
    return (
      <Card>
        <BannerAction
          tone="negative"
          announce={!failureIsSessionEnd}
          message={failureWords[shownFailure].body}
          action={{
            label: failureWords[shownFailure].retry,
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
          {t("card_balance.remaining_today", {
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
