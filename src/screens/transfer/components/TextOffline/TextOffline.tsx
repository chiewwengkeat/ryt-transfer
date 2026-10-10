import { useTranslation } from "react-i18next";

import TextBody from "@/shared/ui/TextBody/TextBody";

export default function TextOffline() {
  const { t } = useTranslation("transfer");
  return (
    <TextBody tone="warning" alignCenter>
      {t("common.offline.no_connection")}
    </TextBody>
  );
}
