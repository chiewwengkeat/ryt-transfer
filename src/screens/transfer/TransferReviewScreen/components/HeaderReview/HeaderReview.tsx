import { Stack, useNavigation } from "expo-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { BackHandler } from "react-native";

import {
  isTransferBeingSent,
  useTransferFlow,
} from "@/screens/transfer/state/transfer-flow";

export default function HeaderReview() {
  const { t } = useTranslation("transfer");
  const navigation = useNavigation();
  const sending = useTransferFlow(isTransferBeingSent);
  // Android's Back and the root stack's swipe too, which this stack's options never reach: leaving
  // mid-send strands an approval no screen can answer.
  useEffect(() => {
    if (!sending) return;
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
  }, [navigation, sending]);

  return (
    <Stack.Screen
      options={{
        title: t("review.title"),
        headerBackVisible: !sending,
        gestureEnabled: !sending,
      }}
    />
  );
}
