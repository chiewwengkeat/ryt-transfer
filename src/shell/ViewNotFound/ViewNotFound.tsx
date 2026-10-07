import { router, Stack } from "expo-router";
import { useTranslation } from "react-i18next";

import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";
import ViewMessage from "@/shared/ui/ViewMessage/ViewMessage";

export default function ViewNotFound() {
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen options={{ title: t("view_not_found.title") }} />
      <ViewMessage
        title={t("view_not_found.title")}
        message={t("view_not_found.body")}
        actions={
          <ButtonPrimary
            label={t("view_not_found.home")}
            onPress={() => {
              router.replace("/");
            }}
          />
        }
      />
    </>
  );
}
