import { useGetPrimaryAccount } from "@/domains/account/api/get-primary-account/get-primary-account";
import {
  getTransferLimitsMaintenance,
  useGetTransferLimits,
} from "@/domains/account/api/get-transfer-limits/get-transfer-limits";
import { useOfflineNotice } from "@/domains/transfer/hooks/use-offline-notice/use-offline-notice";
import { useQueryError } from "@/shared/hooks/use-query-error/use-query-error";
import { formatMalaysianDateTime } from "@/shared/lib/dates/dates";
import { useTranslation } from "react-i18next";

export function useStartTransferAvailability() {
  const { t } = useTranslation(["transfer", "shared"]);
  const noticeOffline = useOfflineNotice();
  const account = useGetPrimaryAccount();
  const limits = useGetTransferLimits();
  const maintenance = getTransferLimitsMaintenance(
    useQueryError(
      limits.error,
      limits.isPending && limits.fetchStatus !== "idle",
    ),
  );
  const reasonStartTransferDisabled = (() => {
    if (noticeOffline !== undefined) return noticeOffline;
    if (maintenance?.until !== undefined)
      return t("common.under_maintenance.until", {
        time: formatMalaysianDateTime(maintenance.until, t),
      });
    if (maintenance !== undefined) return t("common.under_maintenance.body");
    if (account.isSuccess && limits.isSuccess) return undefined;
    return t("common.balance_unavailable.disabled_reason");
  })();
  const isFirstReadRunning =
    noticeOffline === undefined &&
    [account, limits].some(
      // Not isPending: a read with no data goes back to pending each time it is asked again.
      (read) =>
        read.fetchStatus === "fetching" &&
        read.dataUpdatedAt === 0 &&
        read.errorUpdatedAt === 0,
    );
  return { reasonStartTransferDisabled, isFirstReadRunning };
}
