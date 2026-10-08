import { useTranslation } from "react-i18next";

import {
  TransferDirection,
  TransferStatus,
  type Transfer,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";

export function useTransferStatusWord(
  transfer: Pick<Transfer, "status" | "underReview" | "direction">,
) {
  const { t } = useTranslation("transfer");
  return (
    {
      [TransferStatus.AwaitingApproval]: t(
        "common.transfer_status.awaiting_approval",
      ),
      [TransferStatus.Processing]: transfer.underReview
        ? t("common.transfer_status.held")
        : t("common.transfer_status.processing"),
      [TransferStatus.Completed]:
        transfer.direction === TransferDirection.In
          ? t("common.transfer_status.received")
          : t("common.transfer_status.sent"),
      [TransferStatus.Unsuccessful]: t("common.transfer_status.unsuccessful"),
      [TransferStatus.Expired]: t("common.transfer_status.expired"),
    } satisfies Record<TransferStatus, string>
  )[transfer.status];
}
