import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";
import ViewMessage from "@/shared/ui/ViewMessage/ViewMessage";
import { router, Stack } from "expo-router";
import { useTranslation } from "react-i18next";

export default function ViewNotFound() {
  const { t } = useTranslation(["shared"]);

  return (
    <>
      <Stack.Screen options={{ title: t("shared:view_not_found.title") }} />
      <ViewMessage
        title={t("shared:view_not_found.title")}
        message={t("shared:view_not_found.body")}
        actions={
          <ButtonPrimary
            label={t("shared:view_not_found.home")}
            onPress={() => {
              router.replace("/");
            }}
          />
        }
      />
    </>
  );
}
