import TextBody from "@/shared/ui/TextBody/TextBody";
import { useTranslation } from "react-i18next";

export default function TextOffline() {
  const { t } = useTranslation("transfer");

  return (
    <TextBody tone="warning" alignCenter>
      {t("common.offline.no_connection")}
    </TextBody>
  );
}
