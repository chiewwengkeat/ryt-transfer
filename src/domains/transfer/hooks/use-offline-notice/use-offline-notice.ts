import { useTrackScenarioShown } from "@/domains/transfer/hooks/use-track-scenario-shown/use-track-scenario-shown";
import { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import { useIsScreenOnTop } from "@/shared/hooks/use-is-screen-on-top/use-is-screen-on-top";
import { useIsOffline } from "@/shared/http/offline/offline";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { AccessibilityInfo } from "react-native";

export function useOfflineNotice() {
  const { t } = useTranslation("transfer");
  const offline = useIsOffline();
  const notice = offline ? t("common.offline.notice") : undefined;
  useTrackScenarioShown(offline ? TransferScenarioId.Offline : undefined);
  const screenOnTop = useIsScreenOnTop();
  const announcedNoticeRef = useRef<string>(undefined);
  // Said aloud as a notice is: a screen reader otherwise meets it only as the footer button's hint.
  useEffect(() => {
    if (notice === undefined) announcedNoticeRef.current = undefined;
    else if (screenOnTop && announcedNoticeRef.current !== notice) {
      announcedNoticeRef.current = notice;
      AccessibilityInfo.announceForAccessibility(notice);
    }
  }, [notice, screenOnTop]);
  return notice;
}
