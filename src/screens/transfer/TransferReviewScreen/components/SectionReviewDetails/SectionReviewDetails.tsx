import { useTranslation } from "react-i18next";

import type { LookupRecipientResponse } from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import { formatMoney } from "@/shared/lib/money/money";
import type { Money } from "@/shared/lib/money/money.type";
import BannerNotice from "@/shared/ui/BannerNotice/BannerNotice";
import Card from "@/shared/ui/Card/Card";
import RowDetail from "@/shared/ui/RowDetail/RowDetail";

interface Props {
  lookup: LookupRecipientResponse;
  amount: Money;
}
export default function SectionReviewDetails({ lookup, amount }: Props) {
  const { t } = useTranslation("transfer");
  return (
    <Card>
      <RowDetail
        label={t("review.recipient_name")}
        value={lookup.recipient.registeredName}
      />
      {lookup.firstTransfer && (
        <BannerNotice message={t("common.first_transfer_to_recipient.body")} />
      )}
      <RowDetail label={t("review.bank")} value={lookup.recipient.bankName} />
      <RowDetail
        label={t("review.mobile")}
        value={lookup.recipient.idValueMasked}
      />
      <RowDetail label={t("review.amount")} value={formatMoney(amount)} />
    </Card>
  );
}
