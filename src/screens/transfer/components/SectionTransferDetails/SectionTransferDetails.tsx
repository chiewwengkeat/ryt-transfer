import { useTranslation } from "react-i18next";

import type { useGetTransfer } from "@/domains/transfer/api/get-transfer/get-transfer";
import { formatMalaysianDateTime } from "@/shared/lib/dates/dates";
import { formatMoney } from "@/shared/lib/money/money";
import Card from "@/shared/ui/Card/Card";
import RowDetail from "@/shared/ui/RowDetail/RowDetail";

interface Props {
  transfer: NonNullable<ReturnType<typeof useGetTransfer>["data"]>;
}
export default function SectionTransferDetails({ transfer }: Props) {
  const { t } = useTranslation("transfer");
  return (
    <Card>
      <RowDetail
        label={t("result.amount")}
        value={formatMoney(transfer.amount)}
      />
      <RowDetail
        label={t("result.recipient_name")}
        value={transfer.counterparty.registeredName}
      />
      <RowDetail
        label={t("result.mobile")}
        value={transfer.counterparty.idValueMasked}
      />
      <RowDetail
        label={t("result.bank")}
        value={transfer.counterparty.bankName}
      />
      {transfer.note && (
        <RowDetail label={t("result.note")} value={transfer.note} />
      )}
      {transfer.reference && (
        <RowDetail label={t("result.reference")} value={transfer.reference} />
      )}
      <RowDetail
        label={t("result.completed_at")}
        value={formatMalaysianDateTime(transfer.updatedAt)}
      />
    </Card>
  );
}
