import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTrackScenarioShown } from "@/domains/transfer/hooks/use-track-scenario-shown/use-track-scenario-shown";
import { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import { useIsOffline } from "@/shared/platform/offline/offline";
import { spacing } from "@/shared/theme/theme";
import BannerNotice from "@/shared/ui/BannerNotice/BannerNotice";
import {
  reserveScreenSpaceForFloatingNotice,
  useScreenFooterHeight,
} from "@/shared/ui/ViewScreenFrame/ViewScreenFrame";

export default function BannerOffline() {
  const { t } = useTranslation("transfer");
  const offline = useIsOffline();
  const { bottom } = useSafeAreaInsets();
  const footerHeight = useScreenFooterHeight();
  useTrackScenarioShown(offline ? TransferScenarioId.Offline : undefined);
  useEffect(() => {
    if (!offline) return;
    return () => {
      reserveScreenSpaceForFloatingNotice(0);
    };
  }, [offline]);
  if (!offline) return null;

  return (
    <View
      onLayout={(event) => {
        reserveScreenSpaceForFloatingNotice(
          event.nativeEvent.layout.height + spacing.sm,
        );
      }}
      style={[
        styles.notice,
        // Above the footer, so it never covers a screen's main action.
        { bottom: Math.max(footerHeight, bottom) + spacing.sm },
      ]}
    >
      <BannerNotice message={t("common.offline.notice")} />
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    pointerEvents: "none",
  },
});
