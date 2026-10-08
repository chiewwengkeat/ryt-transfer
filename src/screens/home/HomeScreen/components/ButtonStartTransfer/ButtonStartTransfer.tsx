import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";

import { useStartTransferDisabledReason } from "../../hooks/use-start-transfer-disabled-reason";

export default function ButtonStartTransfer() {
  const { t } = useTranslation("home");
  const disabledReason = useStartTransferDisabledReason();

  return (
    <ButtonPrimary
      label={t("home.transfer")}
      disabledReason={disabledReason}
      onPress={() => {
        router.push("/transfer");
      }}
    />
  );
}
