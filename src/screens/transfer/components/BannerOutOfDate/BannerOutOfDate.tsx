import { StyleSheet, View } from "react-native";

import { usePhoneReportsConnection } from "@/shared/http/offline/offline";
import { spacing } from "@/shared/theme/theme";
import BannerAction from "@/shared/ui/BannerAction/BannerAction";

import TextOffline from "@/screens/transfer/components/TextOffline/TextOffline";

interface Props {
  message: string;
  announce: boolean;
  tryAgainLabel: string;
  onTryAgain: () => unknown;
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
      <BannerAction
        message={message}
        announce={announce}
        action={
          phoneReportsConnection
            ? { label: tryAgainLabel, onPress: onTryAgain }
            : undefined
        }
      />
      {!phoneReportsConnection && <TextOffline />}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { gap: spacing.sm },
});
