import { StyleSheet, View } from "react-native";

import { spacing } from "@/shared/theme/theme";
import BannerNotice from "@/shared/ui/BannerNotice/BannerNotice";
import ButtonSecondary from "@/shared/ui/ButtonSecondary/ButtonSecondary";

interface Props {
  message: string;
  tryAgainLabel: string;
  onTryAgain: () => void;
}
export default function BannerOutOfDate({
  message,
  tryAgainLabel,
  onTryAgain,
}: Props) {
  return (
    <View style={styles.banner}>
      <BannerNotice message={message} />
      <ButtonSecondary label={tryAgainLabel} onPress={onTryAgain} />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { gap: spacing.sm },
});
