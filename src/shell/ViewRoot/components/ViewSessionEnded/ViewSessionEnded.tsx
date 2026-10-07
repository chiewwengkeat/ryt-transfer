import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { BackHandler, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "@/shared/theme/theme";
import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";
import TextBody from "@/shared/ui/TextBody/TextBody";
import TextHeading from "@/shared/ui/TextHeading/TextHeading";
import ViewScreenFrame from "@/shared/ui/ViewScreenFrame/ViewScreenFrame";

interface Props {
  onSignIn: () => void;
}
export default function ViewSessionEnded({ onSignIn }: Props) {
  const { t } = useTranslation();
  const { top } = useSafeAreaInsets();
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
    <View style={[styles.overlay, { paddingTop: top }]}>
      <ViewScreenFrame
        footer={
          <ButtonPrimary
            label={t("view_session_ended.sign_in")}
            onPress={onSignIn}
          />
        }
      >
        <TextHeading>{t("view_session_ended.title")}</TextHeading>
        <TextBody>{t("view_session_ended.body")}</TextBody>
      </ViewScreenFrame>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: colors.background },
});
