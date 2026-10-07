import { router, type ErrorBoundaryProps } from "expo-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { reportError } from "@/shared/observability/observability";
import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";
import ButtonSecondary from "@/shared/ui/ButtonSecondary/ButtonSecondary";
import ViewMessage from "@/shared/ui/ViewMessage/ViewMessage";

export default function ViewScreenError({ error, retry }: ErrorBoundaryProps) {
  const { t } = useTranslation();
  useEffect(() => {
    reportError(error, { boundary: "route" });
  }, [error]);

  return (
    <ViewMessage
      title={t("view_screen_error.title")}
      message={t("view_screen_error.body")}
      actions={
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
    />
  );
}
