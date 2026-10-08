import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useIsOffline } from "@/shared/platform/offline";
import { minTouchTarget, spacing } from "@/shared/theme/theme";
import BannerNotice from "@/shared/ui/BannerNotice/BannerNotice";
import { useScreenFooterHeight } from "@/shared/ui/ViewScreenFrame/ViewScreenFrame";
import { demoLayer } from "@/shell/app-launch";

export default function BannerOffline() {
  const { t } = useTranslation("transfer");
  const offline = useIsOffline();
  const { bottom } = useSafeAreaInsets();
  const footerHeight = useScreenFooterHeight();
  if (!offline) return null;

  return (
    <View
      style={[
        styles.notice,
        // Above the footer, so it never covers a screen's main action, and above the Demo pill's line.
        {
          bottom:
            Math.max(footerHeight, bottom) +
            spacing.sm +
            (demoLayer === null ? 0 : minTouchTarget + spacing.sm),
        },
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
