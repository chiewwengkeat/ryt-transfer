import { StyleSheet, View } from "react-native";

import { usePhoneReportsConnection } from "@/shared/platform/offline/offline";
import { spacing } from "@/shared/theme/theme";
import BannerNotice from "@/shared/ui/BannerNotice/BannerNotice";
import ButtonSecondary from "@/shared/ui/ButtonSecondary/ButtonSecondary";

interface Props {
  message: string;
  announce: boolean;
  tryAgainLabel: string;
  onTryAgain: () => void;
}
export default function BannerOutOfDate({
  message,
  announce,
  tryAgainLabel,
  onTryAgain,
}: Props) {
  const phoneReportsConnection = usePhoneReportsConnection();
  return (
    <View style={styles.banner}>
      <BannerNotice message={message} announce={announce} />
      {phoneReportsConnection && (
        <ButtonSecondary label={tryAgainLabel} onPress={onTryAgain} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { gap: spacing.sm },
});
