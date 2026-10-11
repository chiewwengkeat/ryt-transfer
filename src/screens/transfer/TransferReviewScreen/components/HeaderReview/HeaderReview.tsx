import {
  isTransferSentOrBeingSent,
  useTransferFlow,
} from "@/screens/transfer/flow-store/flow-store";
import ButtonHeaderBack from "@/shared/ui/ButtonHeaderBack/ButtonHeaderBack";
import { Stack, useNavigation } from "expo-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { BackHandler } from "react-native";

export default function HeaderReview() {
  const { t } = useTranslation("transfer");
  const navigation = useNavigation();

  const isSending = useTransferFlow(isTransferSentOrBeingSent);

  // Android's Back and the root stack's swipe too, which this stack's options never reach: leaving
  // mid-send strands an approval no screen can answer.
  useEffect(() => {
    if (!isSending) return;
    const flowScreen = navigation.getParent();
    flowScreen?.setOptions({ gestureEnabled: false });
    const backPress = BackHandler.addEventListener(
      "hardwareBackPress",
      () => true,
    );
    return () => {
      backPress.remove();
      flowScreen?.setOptions({ gestureEnabled: true });
    };
  }, [navigation, isSending]);

  return (
    <Stack.Screen
      options={{
        title: t("header_review.title"),
        // Set on every render: options merge, so a key set only while sending would outlive the send.
        headerLeft: isSending
          ? () => null
          : ({ tintColor, canGoBack }) => (
              <ButtonHeaderBack
                tintColor={tintColor}
                canGoBack={canGoBack}
                opensHome={false}
              />
            ),
        headerBackVisible: false,
        gestureEnabled: !isSending,
      }}
    />
  );
}
