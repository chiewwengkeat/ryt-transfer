import { useTranslation } from "react-i18next";

import { useGetPrimaryAccount } from "@/domains/account/api/get-primary-account/get-primary-account";
import {
  useGetTransferLimits,
  useTransferLimitsMaintenance,
} from "@/domains/account/api/get-transfer-limits/get-transfer-limits";
import { useOfflineNotice } from "@/domains/transfer/hooks/use-offline-notice/use-offline-notice";
import { formatMalaysianDateTime } from "@/shared/lib/dates/dates";

export function useStartTransferAvailability() {
  const { t } = useTranslation(["transfer", "shared"]);
  const offlineNotice = useOfflineNotice();
  const account = useGetPrimaryAccount();
  const limits = useGetTransferLimits();
  const maintenance = useTransferLimitsMaintenance(limits);

  return {
    startTransferDisabledReason:
      offlineNotice !== undefined
        ? offlineNotice
        : maintenance?.until !== undefined
          ? t("common.under_maintenance.until", {
              time: formatMalaysianDateTime(maintenance.until, t),
            })
          : maintenance !== undefined
            ? t("common.under_maintenance.body")
            : account.isSuccess && limits.isSuccess
              ? undefined
              : t("common.balance_unavailable.disabled_reason"),
    firstReadRunning:
      offlineNotice === undefined &&
      [account, limits].some(
        // Not isPending: a read with no data goes back to pending each time it is asked again.
        (read) =>
          read.fetchStatus === "fetching" &&
          read.dataUpdatedAt === 0 &&
          read.errorUpdatedAt === 0,
      ),
  };
}
