import { useTranslation } from "react-i18next";

import type {
  LookupRecipientResponse,
  RecipientIdType,
} from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import RowDetail from "@/shared/ui/RowDetail/RowDetail";

interface Props {
  recipient: LookupRecipientResponse["recipient"];
}
export default function SectionReviewRecipient({ recipient }: Props) {
  const { t } = useTranslation("transfer");
  return (
    <>
      <RowDetail
        label={t("common.section_transfer_details.bank")}
        value={recipient.bankName}
      />
      <RowDetail
        label={t(
          `common.section_transfer_details.${recipient.idType.toLowerCase() as Lowercase<RecipientIdType>}`,
        )}
        value={recipient.idValueMasked}
      />
    </>
  );
}
