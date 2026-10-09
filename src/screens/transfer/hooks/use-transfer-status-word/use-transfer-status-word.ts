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
        "transfer_status_word.awaiting_approval",
      ),
      [TransferStatus.Processing]: transfer.underReview
        ? t("transfer_status_word.held")
        : t("transfer_status_word.processing"),
      [TransferStatus.Completed]:
        transfer.direction === TransferDirection.In
          ? t("transfer_status_word.received")
          : t("transfer_status_word.sent"),
      [TransferStatus.Unsuccessful]: t("transfer_status_word.unsuccessful"),
      [TransferStatus.Expired]: t("transfer_status_word.expired"),
    } satisfies Record<TransferStatus, string>
  )[transfer.status];
}
