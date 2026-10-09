import { router, type ErrorBoundaryProps } from "expo-router";
import { useEffect, useLayoutEffect } from "react";
import { useTranslation } from "react-i18next";

import { reportError } from "@/shared/observability/observability";
import { markScreenErrorShowing } from "@/shared/platform/screen-capture/screen-capture";
import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";
import ButtonSecondary from "@/shared/ui/ButtonSecondary/ButtonSecondary";
import ViewMessage from "@/shared/ui/ViewMessage/ViewMessage";

export default function ViewScreenError({ error, retry }: ErrorBoundaryProps) {
  const { t } = useTranslation(["shared"]);
  useEffect(() => {
    reportError(error, { boundary: "route" });
  }, [error]);
  // Before paint: the screen this replaces may have allowed capture.
  useLayoutEffect(() => markScreenErrorShowing(), []);

  return (
    <ViewMessage
      title={t("shared:view_screen_error.title")}
      message={t("shared:view_screen_error.body")}
      actions={
        <>
          <ButtonPrimary
            label={t("shared:view_screen_error.retry")}
            onPress={() => {
              void retry();
            }}
          />
          {router.canGoBack() && (
            <ButtonSecondary
              label={t("shared:view_screen_error.back")}
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
