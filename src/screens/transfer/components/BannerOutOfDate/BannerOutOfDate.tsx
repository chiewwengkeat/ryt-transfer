import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";

import { spacing } from "@/shared/theme/theme";
import BannerNotice from "@/shared/ui/BannerNotice/BannerNotice";
import ButtonSecondary from "@/shared/ui/ButtonSecondary/ButtonSecondary";

interface Props {
  message: string;
  onTryAgain: () => void;
}
export default function BannerOutOfDate({ message, onTryAgain }: Props) {
  const { t } = useTranslation("transfer");

  return (
    <View style={styles.banner}>
      <BannerNotice message={message} />
      <ButtonSecondary label={t("history.try_again")} onPress={onTryAgain} />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { gap: spacing.sm },
});
