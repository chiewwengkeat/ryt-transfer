import type { ErrorBoundaryProps } from "expo-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { reportError } from "@/shared/observability/observability";
import { colors } from "@/shared/theme/theme";
import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";
import TextBody from "@/shared/ui/TextBody/TextBody";
import TextHeading from "@/shared/ui/TextHeading/TextHeading";
import ViewScreenFrame from "@/shared/ui/ViewScreenFrame/ViewScreenFrame";

export default function ViewAppError({ error, retry }: ErrorBoundaryProps) {
  const { t } = useTranslation();
  const { top } = useSafeAreaInsets();
  useEffect(() => {
    reportError(error, { boundary: "root" });
  }, [error]);

  return (
    <View style={[styles.container, { paddingTop: top }]}>
      <ViewScreenFrame
        footer={
          <ButtonPrimary
            label={t("view_app_error.retry")}
            onPress={() => {
              void retry();
            }}
          />
        }
      >
        <TextHeading>{t("view_app_error.title")}</TextHeading>
        <TextBody>{t("view_app_error.body")}</TextBody>
      </ViewScreenFrame>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
});
