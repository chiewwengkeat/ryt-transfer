import { useTranslation } from "react-i18next";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { usePhoneReportsConnection } from "@/shared/platform/offline";
import { colors, spacing } from "@/shared/theme/theme";
import BannerNotice from "@/shared/ui/BannerNotice/BannerNotice";
import ButtonSecondary from "@/shared/ui/ButtonSecondary/ButtonSecondary";
import TextBody from "@/shared/ui/TextBody/TextBody";

interface Props {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  onRetry: () => void;
}
export default function ViewTransferHistoryFooter({
  hasNextPage,
  isFetchingNextPage,
  isFetchNextPageError,
  onRetry,
}: Props) {
  const { t, i18n } = useTranslation("transfer");
  const { bottom } = useSafeAreaInsets();
  const phoneReportsConnection = usePhoneReportsConnection();

  return (
    <View style={[styles.footer, { paddingBottom: spacing.md + bottom }]}>
      {/* The failure flag stays up while its retry runs. */}
      {isFetchNextPageError && !isFetchingNextPage ? (
        <>
          <BannerNotice tone="negative" message={t("history.footer.failed")} />
          {phoneReportsConnection && (
            <ButtonSecondary
              label={t("history.footer.retry")}
              onPress={onRetry}
            />
          )}
        </>
      ) : !hasNextPage ? (
        <TextBody tone="secondary">{t("history.footer.end")}</TextBody>
      ) : (
        isFetchingNextPage && (
          <ActivityIndicator
            accessibilityLabel={t("history.footer.loading")}
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
