import { useTranslation } from "react-i18next";

import type { useGetTransfer } from "@/domains/transfer/api/get-transfer/get-transfer";
import {
  TransferDirection,
  TransferFunds,
  TransferStatus,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import { useTransferStatusWord } from "@/screens/transfer/hooks/use-transfer-status-word";
import { formatMalaysianDateTime } from "@/shared/lib/dates/dates";
import { formatMoney } from "@/shared/lib/money/money";
import Card from "@/shared/ui/Card/Card";
import RowDetail from "@/shared/ui/RowDetail/RowDetail";

interface Props {
  transfer: NonNullable<ReturnType<typeof useGetTransfer>["data"]>;
}
export default function SectionTransferDetails({ transfer }: Props) {
  const { t } = useTranslation("transfer");
  const statusWord = useTransferStatusWord(transfer);
  const received = transfer.direction === TransferDirection.In;
  // No phrase where the matrix has none (received, approval in flight), nor "money returned" before a refund lands.
  const moneyState = received
    ? undefined
    : (
        {
          [TransferFunds.NotDebited]:
            transfer.status === TransferStatus.AwaitingApproval
              ? undefined
              : t("common.section_transfer_details.money.no_money_moved"),
          [TransferFunds.Debited]:
            transfer.status === TransferStatus.Completed
              ? t("common.section_transfer_details.money.money_moved")
              : t("common.section_transfer_details.money.not_confirmed_yet"),
          [TransferFunds.RefundPending]: undefined,
          [TransferFunds.Refunded]: t(
            "common.section_transfer_details.money.money_returned",
          ),
          [TransferFunds.Credited]: undefined,
        } satisfies Record<TransferFunds, string | undefined>
      )[transfer.funds];
  const settledLabel = (
    {
      [TransferStatus.AwaitingApproval]: undefined,
      [TransferStatus.Processing]: undefined,
      [TransferStatus.Completed]: t(
        "common.section_transfer_details.completed_at",
      ),
      [TransferStatus.Unsuccessful]:
        transfer.funds === TransferFunds.Refunded
          ? t("common.section_transfer_details.refunded_at")
          : undefined,
      [TransferStatus.Expired]: undefined,
    } satisfies Record<TransferStatus, string | undefined>
  )[transfer.status];
  // History keeps a row whose time it cannot read, and formatting such a time throws.
  const sentAt = Number.isNaN(Date.parse(transfer.createdAt))
    ? undefined
    : formatMalaysianDateTime(transfer.createdAt);
  const settledAt = Number.isNaN(Date.parse(transfer.updatedAt))
    ? undefined
    : formatMalaysianDateTime(transfer.updatedAt);

  return (
    <Card>
      <RowDetail
        label={t("common.section_transfer_details.status")}
        value={
          moneyState === undefined
            ? statusWord
            : t("common.section_transfer_details.status_and_money", {
                status: statusWord,
                money: moneyState,
              })
        }
      />
      <RowDetail
        label={t("common.section_transfer_details.amount")}
        value={formatMoney(transfer.amount)}
      />
      <RowDetail
        label={
          received
            ? t("common.section_transfer_details.received_from")
            : t("common.section_transfer_details.sent_to")
        }
        value={transfer.counterparty.registeredName}
      />
      <RowDetail
        label={t("common.section_transfer_details.mobile")}
        value={transfer.counterparty.idValueMasked}
      />
      <RowDetail
        label={t("common.section_transfer_details.bank")}
        value={transfer.counterparty.bankName}
      />
      {transfer.note && (
        <RowDetail
          label={t("common.section_transfer_details.note")}
          value={transfer.note}
        />
      )}
      {transfer.reference && (
        <RowDetail
          label={t("common.section_transfer_details.reference")}
          value={transfer.reference}
        />
      )}
      {sentAt !== undefined && (
        <RowDetail
          label={
            received
              ? t("common.section_transfer_details.received_at")
              : t("common.section_transfer_details.sent_at")
          }
          value={sentAt}
        />
      )}
      {settledLabel !== undefined &&
        settledAt !== undefined &&
        settledAt !== sentAt && (
          <RowDetail label={settledLabel} value={settledAt} />
        )}
    </Card>
  );
}
