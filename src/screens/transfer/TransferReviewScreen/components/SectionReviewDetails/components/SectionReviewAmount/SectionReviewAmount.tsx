import { useTranslation } from "react-i18next";

import type { TransferDraft } from "@/screens/transfer/state/transfer-flow.type";
import { formatMoney } from "@/shared/lib/money/money";
import RowDetail from "@/shared/ui/RowDetail/RowDetail";

interface Props {
  draft: TransferDraft;
}
export default function SectionReviewAmount({ draft }: Props) {
  const { t } = useTranslation("transfer");
  return (
    <>
      <RowDetail
        label={t("common.section_transfer_details.amount")}
        value={formatMoney(draft.amount)}
      />
      {draft.note !== undefined && (
        <RowDetail
          label={t("common.section_transfer_details.note")}
          value={draft.note}
        />
      )}
    </>
  );
}
