import { useTranslation } from "react-i18next";

import { useGetPrimaryAccount } from "@/domains/account/api/get-primary-account/get-primary-account";
import {
  getTransferLimitsMaintenance,
  useGetTransferLimits,
} from "@/domains/account/api/get-transfer-limits/get-transfer-limits";
import { formatMalaysianDateTime } from "@/shared/lib/dates/dates";
import { useIsOffline } from "@/shared/platform/offline";

export function useStartTransferDisabledReason() {
  const { t } = useTranslation("transfer");
  const offline = useIsOffline();
  const account = useGetPrimaryAccount();
  const limits = useGetTransferLimits();
  const maintenance = getTransferLimitsMaintenance(limits.error);

  return offline
    ? t("common.offline.disabled_reason")
    : maintenance?.until !== undefined
      ? t("common.under_maintenance.until", {
          time: formatMalaysianDateTime(maintenance.until, t),
        })
      : maintenance !== undefined
        ? t("common.under_maintenance.body")
        : account.isSuccess && limits.isSuccess
          ? undefined
          : t("common.balance_unavailable.disabled_reason");
}
