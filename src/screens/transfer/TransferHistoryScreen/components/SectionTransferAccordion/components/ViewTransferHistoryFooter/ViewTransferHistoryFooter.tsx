import { useTranslation } from "react-i18next";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
  const { t } = useTranslation("transfer");
  const { bottom } = useSafeAreaInsets();

  return (
    <View style={[styles.footer, { paddingBottom: spacing.md + bottom }]}>
      {/* The failure flag stays up while its retry runs. */}
      {isFetchNextPageError && !isFetchingNextPage ? (
        <>
          <BannerNotice tone="negative" message={t("history.footer.failed")} />
          <ButtonSecondary
            label={t("history.footer.retry")}
            onPress={onRetry}
          />
        </>
      ) : hasNextPage ? (
        <ActivityIndicator
          accessibilityLabel={t("history.footer.loading")}
          color={colors.accent}
        />
      ) : (
        <TextBody tone="secondary">{t("history.footer.end")}</TextBody>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  footer: { gap: spacing.sm, padding: spacing.md },
});
