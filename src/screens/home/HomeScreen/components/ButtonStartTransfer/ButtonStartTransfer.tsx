import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import { useGetPrimaryAccount } from "@/domains/account/api/get-primary-account/get-primary-account";
import { useGetTransferLimits } from "@/domains/account/api/get-transfer-limits/get-transfer-limits";
import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";

import { useStartTransferDisabledReason } from "../../hooks/use-start-transfer-disabled-reason";

export default function ButtonStartTransfer() {
  const { t } = useTranslation("home");
  const account = useGetPrimaryAccount();
  const limits = useGetTransferLimits();
  const disabledReason = useStartTransferDisabledReason();
  // Absent rather than disabled until the first answers: a reason would flash under it on every launch.
  if (account.isPending || limits.isPending) return null;

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
