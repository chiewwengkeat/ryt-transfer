import BannerAction from "@/shared/ui/BannerAction/BannerAction";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";

interface Props {
  announce: boolean;
}
export default function BannerRecipientNotFound({ announce }: Props) {
  const { t } = useTranslation("transfer");

  return (
    <BannerAction
      tone="negative"
      announce={announce}
      message={t("common.recipient_not_found.body")}
      action={{
        label: t("common.recipient_not_found.change_recipient"),
        onPress: () => router.dismissTo("/transfer"),
      }}
    />
  );
}
