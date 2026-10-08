import { getPermissionsAsync } from "expo-contacts";
import { useEffect, useEffectEvent } from "react";
import { useTranslation } from "react-i18next";
import { AppState, Linking } from "react-native";

import { TransferFlowScenario } from "@/screens/transfer/state/transfer-flow";
import { useTrackScenarioShown } from "@/shared/observability/observability";
import BannerAction from "@/shared/ui/BannerAction/BannerAction";

interface Props {
  onAccessGranted: () => void;
}
export default function BannerContactsRefused({ onAccessGranted }: Props) {
  const { t } = useTranslation("transfer");
  useTrackScenarioShown(TransferFlowScenario.ContactsAccessRefused);
  const recheckContactsAccess = useEffectEvent(async () => {
    if ((await getPermissionsAsync()).granted) onAccessGranted();
  });
  // Access is granted in the phone's Settings, outside the app, so the only sign of it is the app coming back.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (appState) => {
      if (appState === "active") void recheckContactsAccess();
    });
    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <BannerAction
      message={t("common.contacts_access_refused.body")}
      action={{
        label: t("common.contacts_access_refused.open_settings"),
        onPress: () => {
          void Linking.openSettings();
        },
      }}
    />
  );
}
