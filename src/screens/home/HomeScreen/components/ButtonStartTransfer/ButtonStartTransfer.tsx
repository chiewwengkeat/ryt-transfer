import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import { useGetPrimaryAccount } from "@/domains/account/api/get-primary-account/get-primary-account";
import {
  getTransferLimitsMaintenance,
  useGetTransferLimits,
} from "@/domains/account/api/get-transfer-limits/get-transfer-limits";
import { formatMalaysianDateTime } from "@/shared/lib/dates/dates";
import { useIsOffline } from "@/shared/platform/offline";
import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";

export default function ButtonStartTransfer() {
  const { t } = useTranslation(["home", "transfer"]);
  const offline = useIsOffline();
  const account = useGetPrimaryAccount();
  const limits = useGetTransferLimits();
  // Absent rather than disabled until the first answers: a reason would flash under it on every launch.
  if (account.isPending || limits.isPending) return null;
  const maintenance = getTransferLimitsMaintenance(limits.error);

  const disabledReason = offline
    ? t("transfer:common.offline.disabled_reason")
    : maintenance?.until !== undefined
      ? t("transfer:common.under_maintenance.until", {
          time: formatMalaysianDateTime(maintenance.until),
        })
      : maintenance !== undefined
        ? t("transfer:common.under_maintenance.body")
        : account.isSuccess && limits.isSuccess
          ? undefined
          : t("transfer:common.balance_unavailable.disabled_reason");

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
