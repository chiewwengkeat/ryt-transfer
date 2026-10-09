import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { accountKeys } from "@/domains/account/api/account.keys";
import { useGetPrimaryAccount } from "@/domains/account/api/get-primary-account/get-primary-account";
import { getListRecentRecipientsOptions } from "@/domains/transfer/api/list-recent-recipients/list-recent-recipients";
import { resetTransferHistory } from "@/domains/transfer/api/list-transfers/list-transfers";
import BannerEarlierTransferUnconfirmed from "@/domains/transfer/components/BannerEarlierTransferUnconfirmed/BannerEarlierTransferUnconfirmed";
import {
  refreshPendingTransferNotices,
  usePendingTransferNotices,
} from "@/domains/transfer/hooks/pending-transfer-notices";
import { clearPendingTransfer } from "@/domains/transfer/hooks/pending-transfers";
import { formatMoney } from "@/shared/lib/money/money";
import { reportError } from "@/shared/observability/observability";
import BannerAction from "@/shared/ui/BannerAction/BannerAction";

export default function SectionTransferNotices() {
  const { t } = useTranslation("home");
  const queryClient = useQueryClient();
  const customerId = useGetPrimaryAccount().data?.customerId;
  const { settled } = usePendingTransferNotices();

  return (
    <>
      <BannerEarlierTransferUnconfirmed
        onEarlierTransferSettled={() => {
          void queryClient.invalidateQueries({ queryKey: accountKeys.all });
          void resetTransferHistory(queryClient);
          void queryClient.invalidateQueries({
            queryKey: getListRecentRecipientsOptions().queryKey,
          });
        }}
      />
      {settled.map(({ transferId, transfer, notice }) => {
        const amountAndName = {
          amount: formatMoney(transfer.amount),
          name: transfer.counterparty.registeredName,
        };
        return (
          <BannerAction
            key={transferId}
            message={t(`next_launch_notices.${notice}`, amountAndName)}
            action={{
              label: t("next_launch_notices.dismiss"),
              accessibilityLabel: t(
                "next_launch_notices.dismiss_notice_about",
                amountAndName,
              ),
              onPress: () => {
                if (customerId === undefined) return;
                void (async () => {
                  await clearPendingTransfer(customerId, transferId);
                  await refreshPendingTransferNotices(queryClient, customerId);
                })().catch((error: unknown) => {
                  reportError(error, { boundary: "pending_transfer" });
                });
              },
            }}
          />
        );
      })}
    </>
  );
}
