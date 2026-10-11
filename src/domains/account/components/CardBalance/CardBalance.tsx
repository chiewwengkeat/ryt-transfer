import { useGetPrimaryAccount } from "@/domains/account/api/get-primary-account/get-primary-account";
import {
  getTransferLimitsMaintenance,
  useGetTransferLimits,
} from "@/domains/account/api/get-transfer-limits/get-transfer-limits";
import { useIsScreenOnTop } from "@/shared/hooks/use-is-screen-on-top/use-is-screen-on-top";
import { useQueryError } from "@/shared/hooks/use-query-error/use-query-error";
import { useIsOffline } from "@/shared/http/offline/offline";
import {
  isSessionEndFailure,
  isUnansweredReadFailure,
} from "@/shared/http/transport-error/transport-error";
import { formatMoney } from "@/shared/lib/money/money";
import {
  colors,
  minTouchTarget,
  spacing,
  typography,
} from "@/shared/theme/theme";
import BannerAction from "@/shared/ui/BannerAction/BannerAction";
import Card from "@/shared/ui/Card/Card";
import Loader from "@/shared/ui/Loader/Loader";
import TextBody from "@/shared/ui/TextBody/TextBody";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";

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
    getTransferLimitsMaintenance(
      useQueryError(
        limits.error,
        limits.isPending && limits.fetchStatus !== "idle",
      ),
    ) !== undefined;
  const failure = useQueryError(
    account.error ?? (limitsPausedForMaintenance ? null : limits.error),
    account.fetchStatus !== "idle" || limits.fetchStatus !== "idle",
  );
  const shownFailure =
    failure === null
      ? undefined
      : isUnansweredReadFailure(failure)
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
  const [pressedReReadsAnswered, setPressedReReadsAnswered] = useState(0);
  // useTrackScenarioShown's rule, which an account component may not import: only on top, once per showing.
  useEffect(() => {
    if (shown === undefined) reportedShownRef.current = undefined;
    else if (screenOnTop && reportedShownRef.current !== shown) {
      reportedShownRef.current = shown;
      if (shown === "loaded") onLoaded();
      else if (shown === "under_maintenance") onUnderMaintenance();
      else onFailed(shown);
    }
  }, [
    shown,
    screenOnTop,
    onLoaded,
    onFailed,
    onUnderMaintenance,
    pressedReReadsAnswered,
  ]);

  if (shownFailure !== undefined) {
    return (
      <Card styles={{ main: [styles.main, styles.floor] }}>
        <BannerAction
          key={pressedReReadsAnswered}
          tone="negative"
          announce={!failureIsSessionEnd}
          message={failureWords[shownFailure].body}
          action={{
            label: failureWords[shownFailure].retry,
            onPress: async () => {
              await Promise.all([account.refetch(), limits.refetch()]);
              // Pressed, the answer is a new showing: said and reported even when it fails the same way.
              reportedShownRef.current = undefined;
              setPressedReReadsAnswered((answered) => answered + 1);
            },
          }}
        />
      </Card>
    );
  }
  if (
    account.data === undefined ||
    (limits.isPending && !limitsPausedForMaintenance)
  ) {
    return (
      <Card styles={{ main: [styles.main, styles.floor] }}>
        <Loader />
      </Card>
    );
  }

  return (
    <Card
      // Below a balance shown alone, during maintenance, the floor is a blank band.
      styles={{ main: [styles.main, limits.isSuccess && styles.floor] }}
    >
      <View
        accessible
        // The group, not its texts: a screen reader reads the group as one element, in the group's language.
        accessibilityLanguage={i18n.language}
      >
        <TextBody tone="secondary">{t("card_balance.label")}</TextBody>
        <Text
          // Grown further, the balance outgrows a small phone's line and breaks inside the number.
          maxFontSizeMultiplier={2}
          style={styles.textBalance}
        >
          {formatMoney(account.data.balance)}
        </Text>
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
  main: { padding: spacing.lg },
  floor: {
    // The failure state's height at default text size, so a retry moves nothing below.
    minHeight:
      2 * spacing.lg +
      2 * spacing.md +
      typography.body.lineHeight +
      spacing.sm +
      minTouchTarget,
    justifyContent: "center",
  },
  textBalance: { ...typography.heading, color: colors.textPrimary },
});
