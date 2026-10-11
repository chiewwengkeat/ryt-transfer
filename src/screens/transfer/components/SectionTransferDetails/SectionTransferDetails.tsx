import type { useGetTransfer } from "@/domains/transfer/api/get-transfer/get-transfer";
import {
  TransferDirection,
  TransferFunds,
  TransferStatus,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import type { RecipientIdType } from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import RowDetail from "@/screens/transfer/components/RowDetail/RowDetail";
import { useTransferStatusWord } from "@/screens/transfer/hooks/use-transfer-status-word/use-transfer-status-word";
import {
  MoneyState,
  readSectionTransferDetailsMoneyState,
} from "@/screens/transfer/lib/transfer-money-state/transfer-money-state";
import { formatMalaysianDateTime } from "@/shared/lib/dates/dates";
import { formatMoney } from "@/shared/lib/money/money";
import Card from "@/shared/ui/Card/Card";
import { useTranslation } from "react-i18next";

interface Props {
  transfer: NonNullable<ReturnType<typeof useGetTransfer>["data"]>;
}
export default function SectionTransferDetails({ transfer }: Props) {
  const { t } = useTranslation(["transfer", "shared"]);

  const statusWord = useTransferStatusWord(transfer);

  const isReceived = transfer.direction === TransferDirection.In;
  const moneyState = readSectionTransferDetailsMoneyState(transfer);
  const moneyPhrase =
    moneyState &&
    {
      [MoneyState.NoMoneyMoved]: t("common.detail_rows.money.no_money_moved"),
      [MoneyState.MoneyMoved]: t("common.detail_rows.money.money_moved"),
      [MoneyState.NotConfirmedYet]: t(
        "common.detail_rows.money.not_confirmed_yet",
      ),
      [MoneyState.MoneyReturned]: t("common.detail_rows.money.money_returned"),
    }[moneyState];
  const labelSettled = (
    {
      [TransferStatus.AwaitingApproval]: undefined,
      [TransferStatus.Processing]: undefined,
      [TransferStatus.Completed]: t("common.detail_rows.completed_at"),
      [TransferStatus.Unsuccessful]:
        transfer.funds === TransferFunds.Refunded
          ? t("common.detail_rows.refunded_at")
          : undefined,
      [TransferStatus.Expired]: undefined,
    } satisfies Record<TransferStatus, string | undefined>
  )[transfer.status];
  // History keeps a row whose time it cannot read, and formatting such a time throws.
  const sentAt = Number.isNaN(Date.parse(transfer.createdAt))
    ? undefined
    : formatMalaysianDateTime(transfer.createdAt, t);
  const settledAt = Number.isNaN(Date.parse(transfer.updatedAt))
    ? undefined
    : formatMalaysianDateTime(transfer.updatedAt, t);

  return (
    <Card>
      <RowDetail
        label={t("common.detail_rows.status")}
        value={
          moneyPhrase === undefined
            ? statusWord
            : t("common.detail_rows.status_and_money", {
                status: statusWord,
                money: moneyPhrase,
              })
        }
      />
      <RowDetail
        label={t("common.detail_rows.amount")}
        value={formatMoney(transfer.amount)}
      />
      <RowDetail
        label={
          isReceived
            ? t("common.detail_rows.received_from")
            : t("common.detail_rows.sent_to")
        }
        value={transfer.counterparty.registeredName}
      />
      <RowDetail
        label={t(
          `common.detail_rows.${transfer.counterparty.idType.toLowerCase() as Lowercase<RecipientIdType>}`,
        )}
        value={transfer.counterparty.idValueMasked}
      />
      <RowDetail
        label={t("common.detail_rows.bank")}
        value={transfer.counterparty.bankName}
      />
      {transfer.note && (
        <RowDetail label={t("common.detail_rows.note")} value={transfer.note} />
      )}
      {transfer.reference && (
        <RowDetail
          label={t("common.detail_rows.reference")}
          value={transfer.reference}
        />
      )}
      {sentAt !== undefined && (
        <RowDetail
          label={
            isReceived
              ? t("common.detail_rows.received_at")
              : t("common.detail_rows.sent_at")
          }
          value={sentAt}
        />
      )}
      {labelSettled !== undefined &&
        settledAt !== undefined &&
        settledAt !== sentAt && (
          <RowDetail label={labelSettled} value={settledAt} />
        )}
    </Card>
  );
}
