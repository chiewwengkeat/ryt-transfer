import { useTranslation } from "react-i18next";

import type {
  LookupRecipientResponse,
  RecipientIdType,
} from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import RowDetail from "@/screens/transfer/components/RowDetail/RowDetail";

interface Props {
  recipient: LookupRecipientResponse["recipient"];
}
export default function SectionReviewRecipient({ recipient }: Props) {
  const { t } = useTranslation("transfer");
  return (
    <>
      <RowDetail
        label={t("section_review_recipient.bank")}
        value={recipient.bankName}
      />
      <RowDetail
        label={t(
          `section_review_recipient.${recipient.idType.toLowerCase() as Lowercase<RecipientIdType>}`,
        )}
        value={recipient.idValueMasked}
      />
    </>
  );
}
