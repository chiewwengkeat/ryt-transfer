import { reportError } from "@/shared/observability/observability/observability";
import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";
import ViewMessage from "@/shared/ui/ViewMessage/ViewMessage";
import type { ErrorBoundaryProps } from "expo-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

export default function ViewAppError({ error, retry }: ErrorBoundaryProps) {
  const { t } = useTranslation(["shared"]);

  useEffect(() => {
    reportError(error, { boundary: "root" });
  }, [error]);

  return (
    <ViewMessage
      fullScreen
      title={t("shared:view_app_error.title")}
      message={t("shared:view_app_error.body")}
      actions={
        <ButtonPrimary
          label={t("shared:view_app_error.retry")}
          onPress={retry}
        />
      }
    />
  );
}
