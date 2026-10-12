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
  onRetry: () => void;
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

  const content = (() => {
    // The query keeps the page's error flag up while its retry runs.
    if (fetchNextPageFailure !== null && !isFetchingNextPage)
      return (
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
      );
    if (!hasNextPage)
      return (
        <TextBody tone="secondary">
          {t("view_transfer_history_footer.end")}
        </TextBody>
      );
    return (
      isFetchingNextPage && (
        <ActivityIndicator
          accessibilityLabel={t("view_transfer_history_footer.loading")}
          accessibilityLanguage={i18n.language}
          color={colors.accent}
        />
      )
    );
  })();
  return (
    <View style={[styles.main, { paddingBottom: spacing.md + bottom }]}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  main: { gap: spacing.sm, paddingVertical: spacing.md },
});
