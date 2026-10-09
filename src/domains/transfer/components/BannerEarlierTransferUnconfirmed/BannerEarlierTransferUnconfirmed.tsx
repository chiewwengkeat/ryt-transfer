import { useTranslation } from "react-i18next";

import BannerNotice from "@/shared/ui/BannerNotice/BannerNotice";

import { usePendingTransferNotices } from "../../hooks/pending-transfer-notices";
import { useTrackScenarioShown } from "../../hooks/use-track-scenario-shown";
import { useRecheckEarlierTransferWhileOnTop } from "./hooks/use-recheck-earlier-transfer-while-on-top";

interface Props {
  onEarlierTransferSettled: () => void;
}
export default function BannerEarlierTransferUnconfirmed({
  onEarlierTransferSettled,
}: Props) {
  const { t } = useTranslation("transfer");
  const {
    customerId,
    unconfirmed: [newestUnconfirmed],
  } = usePendingTransferNotices();
  // Drawn before the transfer is read, but reported only after: a record kept from before this launch may have ended since.
  useTrackScenarioShown(
    newestUnconfirmed?.checkedWithBank
      ? "transfer.earlier_transfer_unconfirmed"
      : undefined,
  );
  useRecheckEarlierTransferWhileOnTop({
    customerId,
    transferId: newestUnconfirmed?.transferId,
    onSettled: onEarlierTransferSettled,
  });
  if (newestUnconfirmed === undefined) return null;

  return (
    <BannerNotice
      message={t("common.earlier_transfer_unconfirmed.body", {
        reference:
          newestUnconfirmed.reference ??
          newestUnconfirmed.transfer?.reference ??
          newestUnconfirmed.transferId,
      })}
    />
  );
}
