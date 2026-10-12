import TextOffline from "@/screens/transfer/components/TextOffline/TextOffline";
import { usePhoneReportsConnection } from "@/shared/http/offline/offline";
import { isSessionEndFailure } from "@/shared/http/transport-error/transport-error";
import { colors, spacing } from "@/shared/theme/theme";
import BannerAction from "@/shared/ui/BannerAction/BannerAction";
import TextBody from "@/shared/ui/TextBody/TextBody";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface Props {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPageFailure: Error | null;
  onRetry: () => unknown;
}
export default function ViewTransferHistoryFooter({
  hasNextPage,
  isFetchingNextPage,
  fetchNextPageFailure,
  onRetry,
}: Props) {
  const { t, i18n } = useTranslation("transfer");

  const { bottom } = useSafeAreaInsets();
  const doesPhoneReportConnection = usePhoneReportsConnection();

  // The query keeps the page's error flag up while its retry runs.
  const isFailureShown = fetchNextPageFailure !== null && !isFetchingNextPage;
  return (
    <View style={[styles.main, { paddingBottom: spacing.md + bottom }]}>
      {isFailureShown && (
        <>
          <BannerAction
            tone="negative"
            announce={!isSessionEndFailure(fetchNextPageFailure)}
            message={t("view_transfer_history_footer.failed")}
            action={
              doesPhoneReportConnection
                ? {
                    label: t("view_transfer_history_footer.retry"),
                    onPress: onRetry,
                  }
                : undefined
            }
          />
          {!doesPhoneReportConnection && <TextOffline />}
        </>
      )}
      {!isFailureShown && !hasNextPage && (
        <TextBody tone="secondary">
          {t("view_transfer_history_footer.end")}
        </TextBody>
      )}
      {hasNextPage && isFetchingNextPage && (
        <ActivityIndicator
          accessibilityLabel={t("view_transfer_history_footer.loading")}
          accessibilityLanguage={i18n.language}
          color={colors.accent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  main: { gap: spacing.sm, paddingVertical: spacing.md },
});
