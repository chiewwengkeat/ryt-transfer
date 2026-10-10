import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import ButtonSecondary from "@/shared/ui/ButtonSecondary/ButtonSecondary";

export default function ButtonTransferHistory() {
  const { t } = useTranslation("home");
  return (
    <ButtonSecondary
      label={t("button_transfer_history.label")}
      onPress={() => {
        router.push("/transfer-history");
      }}
    />
  );
}
