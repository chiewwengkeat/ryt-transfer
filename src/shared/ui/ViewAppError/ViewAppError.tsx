import type { ErrorBoundaryProps } from "expo-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { reportError } from "@/shared/observability/observability";
import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";
import ViewMessage from "@/shared/ui/ViewMessage/ViewMessage";

export default function ViewAppError({ error, retry }: ErrorBoundaryProps) {
  const { t } = useTranslation();
  useEffect(() => {
    reportError(error, { boundary: "root" });
  }, [error]);

  return (
    <ViewMessage
      fullScreen
      title={t("view_app_error.title")}
      message={t("view_app_error.body")}
      actions={
        <ButtonPrimary
          label={t("view_app_error.retry")}
          onPress={() => {
            void retry();
          }}
        />
      }
    />
  );
}
