import { useTranslation } from "react-i18next";

import { useTrackScenarioShown } from "@/shared/observability/observability";
import BannerNotice from "@/shared/ui/BannerNotice/BannerNotice";

import { usePendingTransferNotices } from "../../hooks/pending-transfer-notices";

export default function BannerEarlierTransferUnconfirmed() {
  const { t } = useTranslation("transfer");
  const [newestUnconfirmed] = usePendingTransferNotices().unconfirmed;
  useTrackScenarioShown(
    newestUnconfirmed && "transfer.earlier_transfer_unconfirmed",
  );
  if (newestUnconfirmed === undefined) return null;

  return (
    <BannerNotice
      message={t("common.earlier_transfer_unconfirmed.body", {
        reference:
          newestUnconfirmed.transfer?.reference ?? newestUnconfirmed.transferId,
      })}
    />
  );
}
