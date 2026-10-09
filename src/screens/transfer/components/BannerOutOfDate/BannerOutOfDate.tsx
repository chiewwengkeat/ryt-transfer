import { StyleSheet, View } from "react-native";

import { usePhoneReportsConnection } from "@/shared/platform/offline";
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
  const phoneReportsConnection = usePhoneReportsConnection();
  return (
    <View style={styles.banner}>
      <BannerNotice message={message} />
      {phoneReportsConnection && (
        <ButtonSecondary label={tryAgainLabel} onPress={onTryAgain} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { gap: spacing.sm },
});
