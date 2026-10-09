import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { BackHandler, StyleSheet, View } from "react-native";

import { useTrackScenarioShown } from "@/domains/transfer/hooks/use-track-scenario-shown";
import { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";
import ViewMessage from "@/shared/ui/ViewMessage/ViewMessage";

import TextLastTransferReference from "./components/TextLastTransferReference/TextLastTransferReference";

interface Props {
  onSignIn: () => void;
}
export default function ViewSessionEnded({ onSignIn }: Props) {
  const { t } = useTranslation();
  useTrackScenarioShown(TransferScenarioId.SessionEnded);
  // The app behind is hidden, so Back would move it where nobody can see.
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => true,
    );
    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <View style={StyleSheet.absoluteFill}>
      <ViewMessage
        fullScreen
        title={t("view_session_ended.title")}
        message={t("view_session_ended.body")}
        actions={
          <>
            <TextLastTransferReference />
            <ButtonPrimary
              label={t("view_session_ended.sign_in")}
              onPress={onSignIn}
            />
          </>
        }
      />
    </View>
  );
}
