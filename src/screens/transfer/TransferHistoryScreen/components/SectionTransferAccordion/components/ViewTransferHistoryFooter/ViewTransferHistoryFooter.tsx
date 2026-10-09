import { useTranslation } from "react-i18next";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { isSessionEndFailure } from "@/shared/http/transport-error/transport-error";
import { usePhoneReportsConnection } from "@/shared/platform/offline/offline";
import { colors, spacing } from "@/shared/theme/theme";
import BannerNotice from "@/shared/ui/BannerNotice/BannerNotice";
import ButtonSecondary from "@/shared/ui/ButtonSecondary/ButtonSecondary";
import TextBody from "@/shared/ui/TextBody/TextBody";

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
  const phoneReportsConnection = usePhoneReportsConnection();

  return (
    <View style={[styles.footer, { paddingBottom: spacing.md + bottom }]}>
      {/* The failure stays up while its retry runs. */}
      {fetchNextPageFailure !== null && !isFetchingNextPage ? (
        <>
          <BannerNotice
            tone="negative"
            announce={!isSessionEndFailure(fetchNextPageFailure)}
            message={t("view_transfer_history_footer.failed")}
          />
          {phoneReportsConnection && (
            <ButtonSecondary
              label={t("view_transfer_history_footer.retry")}
              onPress={onRetry}
            />
          )}
        </>
      ) : !hasNextPage ? (
        <TextBody tone="secondary">
          {t("view_transfer_history_footer.end")}
        </TextBody>
      ) : (
        isFetchingNextPage && (
          <ActivityIndicator
            accessibilityLabel={t("view_transfer_history_footer.loading")}
            accessibilityLanguage={i18n.language}
            color={colors.accent}
          />
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  footer: { gap: spacing.sm, padding: spacing.md },
});
