import TextOffline from "@/screens/transfer/components/TextOffline/TextOffline";
import { usePhoneReportsConnection } from "@/shared/http/offline/offline";
import { spacing } from "@/shared/theme/theme";
import BannerAction from "@/shared/ui/BannerAction/BannerAction";
import { StyleSheet, View } from "react-native";

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
  const doesPhoneReportConnection = usePhoneReportsConnection();

  return (
    <View style={styles.main}>
      <BannerAction
        message={message}
        announce={announce}
        action={
          doesPhoneReportConnection
            ? { label: tryAgainLabel, onPress: onTryAgain }
            : undefined
        }
      />
      {!doesPhoneReportConnection && <TextOffline />}
    </View>
  );
}

const styles = StyleSheet.create({
  main: { gap: spacing.sm },
});
