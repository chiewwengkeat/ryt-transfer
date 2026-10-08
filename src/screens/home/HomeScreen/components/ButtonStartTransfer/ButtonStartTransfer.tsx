import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import { useIsOffline } from "@/shared/platform/offline";
import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";

export default function ButtonStartTransfer() {
  const { t } = useTranslation(["home", "transfer"]);
  const offline = useIsOffline();
  return (
    <ButtonPrimary
      label={t("home.transfer")}
      disabledReason={
        offline ? t("transfer:common.offline.disabled_reason") : undefined
      }
      onPress={() => {
        router.push("/transfer");
      }}
    />
  );
}
