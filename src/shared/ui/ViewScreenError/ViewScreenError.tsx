import { router, type ErrorBoundaryProps } from "expo-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { reportError } from "@/shared/observability/observability";
import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";
import ButtonSecondary from "@/shared/ui/ButtonSecondary/ButtonSecondary";
import TextBody from "@/shared/ui/TextBody/TextBody";
import TextHeading from "@/shared/ui/TextHeading/TextHeading";
import ViewScreenFrame from "@/shared/ui/ViewScreenFrame/ViewScreenFrame";

export default function ViewScreenError({ error, retry }: ErrorBoundaryProps) {
  const { t } = useTranslation();
  useEffect(() => {
    reportError(error, { boundary: "route" });
  }, [error]);

  return (
    <ViewScreenFrame
      footer={
        <>
          <ButtonPrimary
            label={t("view_screen_error.retry")}
            onPress={() => {
              void retry();
            }}
          />
          {router.canGoBack() && (
            <ButtonSecondary
              label={t("view_screen_error.back")}
              onPress={() => {
                router.back();
              }}
            />
          )}
        </>
      }
    >
      <TextHeading>{t("view_screen_error.title")}</TextHeading>
      <TextBody>{t("view_screen_error.body")}</TextBody>
    </ViewScreenFrame>
  );
}
