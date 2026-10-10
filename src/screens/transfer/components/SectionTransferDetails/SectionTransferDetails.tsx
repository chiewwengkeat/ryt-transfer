import { useTranslation } from "react-i18next";

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
  moneyStateByFundsAndStatus,
} from "@/screens/transfer/lib/transfer-money-state/transfer-money-state";
import { formatMalaysianDateTime } from "@/shared/lib/dates/dates";
import { formatMoney } from "@/shared/lib/money/money";
import Card from "@/shared/ui/Card/Card";

interface Props {
  transfer: NonNullable<ReturnType<typeof useGetTransfer>["data"]>;
}
export default function SectionTransferDetails({ transfer }: Props) {
  const { t } = useTranslation(["transfer", "shared"]);
  const statusWord = useTransferStatusWord(transfer);
  const isReceived = transfer.direction === TransferDirection.In;
  const moneyState = moneyStateByFundsAndStatus(transfer);
  const moneyPhrase =
    moneyState &&
    {
      [MoneyState.NoMoneyMoved]: t(
        "common.section_transfer_details.money.no_money_moved",
      ),
      [MoneyState.MoneyMoved]: t(
        "common.section_transfer_details.money.money_moved",
      ),
      [MoneyState.NotConfirmedYet]: t(
        "common.section_transfer_details.money.not_confirmed_yet",
      ),
      [MoneyState.MoneyReturned]: t(
        "common.section_transfer_details.money.money_returned",
      ),
    }[moneyState];
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
    : formatMalaysianDateTime(transfer.createdAt, t);
  const settledAt = Number.isNaN(Date.parse(transfer.updatedAt))
    ? undefined
    : formatMalaysianDateTime(transfer.updatedAt, t);

  return (
    <Card>
      <RowDetail
        label={t("common.section_transfer_details.status")}
        value={
          moneyPhrase === undefined
            ? statusWord
            : t("common.section_transfer_details.status_and_money", {
                status: statusWord,
                money: moneyPhrase,
              })
        }
      />
      <RowDetail
        label={t("common.section_transfer_details.amount")}
        value={formatMoney(transfer.amount)}
      />
      <RowDetail
        label={
          isReceived
            ? t("common.section_transfer_details.received_from")
            : t("common.section_transfer_details.sent_to")
        }
        value={transfer.counterparty.registeredName}
      />
      <RowDetail
        label={t(
          `common.section_transfer_details.${transfer.counterparty.idType.toLowerCase() as Lowercase<RecipientIdType>}`,
        )}
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
            isReceived
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
