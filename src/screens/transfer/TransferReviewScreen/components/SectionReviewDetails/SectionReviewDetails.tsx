import { router } from "expo-router";
import { useTranslation } from "react-i18next";

import { useLookupRecipient } from "@/domains/transfer/api/lookup-recipient/lookup-recipient";
import { LookupRecipientErrorCode } from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import {
  TransferFlowStep,
  useTransferFlow,
} from "@/screens/transfer/state/transfer-flow";
import type { TransferDraft } from "@/screens/transfer/state/transfer-flow.type";
import { TransportError } from "@/shared/http/transport-error";
import BannerNotice from "@/shared/ui/BannerNotice/BannerNotice";
import ButtonSecondary from "@/shared/ui/ButtonSecondary/ButtonSecondary";
import Card from "@/shared/ui/Card/Card";
import Loader from "@/shared/ui/Loader/Loader";
import RowDetail from "@/shared/ui/RowDetail/RowDetail";

import SectionReviewAmount from "./components/SectionReviewAmount/SectionReviewAmount";
import SectionReviewRecipient from "./components/SectionReviewRecipient/SectionReviewRecipient";

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
  // Never while sending: "no money moved" can be false by then, and a retry mints a new recipient reference.
  if (lookup.isError && !sending) {
    const code =
      lookup.error instanceof TransportError ? lookup.error.code : undefined;
    if (code === LookupRecipientErrorCode.RecipientNotFound)
      return (
        <>
          <BannerNotice
            tone="negative"
            message={t("common.recipient_not_found.body")}
          />
          <ButtonSecondary
            label={t("common.recipient_not_found.change_recipient")}
            onPress={() => {
              router.dismissTo("/transfer");
            }}
          />
        </>
      );
    const scenario =
      code === LookupRecipientErrorCode.NameEnquiryUnavailable
        ? "name_check_unavailable"
        : code === LookupRecipientErrorCode.TooManyLookups
          ? "too_many_name_checks"
          : "review_unexpected";
    return (
      <>
        <BannerNotice tone="negative" message={t(`common.${scenario}.body`)} />
        <ButtonSecondary
          label={t(`common.${scenario}.retry`)}
          onPress={() => {
            void lookup.refetch();
          }}
        />
      </>
    );
  }
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
      <SectionReviewRecipient recipient={recipient} />
      <SectionReviewAmount draft={draft} />
    </Card>
  );
}
