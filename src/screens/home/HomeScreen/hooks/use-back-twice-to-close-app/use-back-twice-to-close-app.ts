import { useIsFocused, useNavigation } from "expo-router";
import { useEffect, useEffectEvent } from "react";
import { useTranslation } from "react-i18next";
import { BackHandler, ToastAndroid } from "react-native";

export function useBackTwiceToCloseApp() {
  const { t } = useTranslation("home");
  const navigation = useNavigation();
  const isHomeFocused = useIsFocused();
  const showPressBackAgainToast = useEffectEvent(() => {
    ToastAndroid.show(t("home.close_toast"), ToastAndroid.SHORT);
  });
  useEffect(() => {
    if (!isHomeFocused) return;
    let toastShownAt = Number.NEGATIVE_INFINITY;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        // A link to Home that arrives over another screen pushes a second Home, whose Back goes back.
        if (navigation.canGoBack()) return false;
        // Toast.LENGTH_SHORT's 2 s: a second Back closes the app only while the toast still shows.
        if (Date.now() - toastShownAt < 2000) return false;
        toastShownAt = Date.now();
        showPressBackAgainToast();
        return true;
      },
    );
    return () => {
      subscription.remove();
    };
  }, [isHomeFocused, navigation]);
}
