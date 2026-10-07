import { useTranslation } from "react-i18next";

import { useLookupRecipient } from "@/domains/transfer/api/lookup-recipient/lookup-recipient";
import {
  TransferFlowStep,
  useTransferFlow,
} from "@/screens/transfer/state/transfer-flow";
import type { TransferDraft } from "@/screens/transfer/state/transfer-flow.type";
import { formatMoney } from "@/shared/lib/money/money";
import BannerNotice from "@/shared/ui/BannerNotice/BannerNotice";
import ButtonSecondary from "@/shared/ui/ButtonSecondary/ButtonSecondary";
import Card from "@/shared/ui/Card/Card";
import Loader from "@/shared/ui/Loader/Loader";
import RowDetail from "@/shared/ui/RowDetail/RowDetail";

interface Props {
  draft: TransferDraft;
}
export default function SectionReviewDetails({ draft }: Props) {
  const { t } = useTranslation("transfer");
  const lookup = useLookupRecipient(draft.recipient);
  const sending = useTransferFlow(
    (flow) =>
      flow.step === TransferFlowStep.Creating ||
      flow.step === TransferFlowStep.Approving ||
      flow.step === TransferFlowStep.Submitting,
  );
  if (lookup.isPending) return <Loader />;
  // Never while sending: it says no money moved, which a sent approval can make false.
  if (lookup.isError && !sending)
    return (
      <>
        <BannerNotice
          tone="negative"
          message={t("common.review_unexpected.body")}
        />
        <ButtonSecondary
          label={t("common.review_unexpected.retry")}
          onPress={() => {
            void lookup.refetch();
          }}
        />
      </>
    );
  if (!lookup.data) return null;

  const { recipient, firstTransfer } = lookup.data;
  return (
    <Card>
      <RowDetail
        label={t("review.recipient_name")}
        value={recipient.registeredName}
      />
      {firstTransfer && (
        <BannerNotice message={t("common.first_transfer_to_recipient.body")} />
      )}
      <RowDetail label={t("review.bank")} value={recipient.bankName} />
      <RowDetail label={t("review.mobile")} value={recipient.idValueMasked} />
      <RowDetail label={t("review.amount")} value={formatMoney(draft.amount)} />
    </Card>
  );
}
