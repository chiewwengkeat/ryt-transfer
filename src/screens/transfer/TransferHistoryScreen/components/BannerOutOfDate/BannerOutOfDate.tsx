import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";

import { resetTransferHistory } from "@/domains/transfer/api/list-transfers/list-transfers";
import { colors, spacing } from "@/shared/theme/theme";
import BannerNotice from "@/shared/ui/BannerNotice/BannerNotice";
import ButtonSecondary from "@/shared/ui/ButtonSecondary/ButtonSecondary";

export default function BannerOutOfDate() {
  const { t } = useTranslation("transfer");
  const queryClient = useQueryClient();

  return (
    <View style={styles.banner}>
      <BannerNotice message={t("history.out_of_date")} />
      <ButtonSecondary
        label={t("history.try_again")}
        onPress={() => {
          void resetTransferHistory(queryClient);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.background,
  },
});
