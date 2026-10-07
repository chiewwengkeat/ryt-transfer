import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";

export default function ButtonStartTransfer() {
  const { t } = useTranslation("home");
  return (
    <ButtonPrimary
      label={t("home.transfer")}
      onPress={() => {
        router.push("/transfer");
      }}
    />
  );
}
