import { router } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useLookupRecipient } from "@/domains/transfer/api/lookup-recipient/lookup-recipient";
import { LookupRecipientErrorCode } from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import { useTrackScenarioShown } from "@/domains/transfer/hooks/use-track-scenario-shown";
import {
  isTransferBeingSent,
  TransferFlowScenario,
  useTransferFlow,
} from "@/screens/transfer/state/transfer-flow";
import type { TransferDraft } from "@/screens/transfer/state/transfer-flow.type";
import {
  isSessionEndFailure,
  TransportError,
} from "@/shared/http/transport-error";
import BannerAction from "@/shared/ui/BannerAction/BannerAction";
import BannerNotice from "@/shared/ui/BannerNotice/BannerNotice";
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
  const sending = useTransferFlow(isTransferBeingSent);
  const code =
    lookup.error instanceof TransportError ? lookup.error.code : undefined;
  // Never while sending: "no money moved" can be false by then, and a retry mints a new recipient reference.
  // Never for the session's end either: sign-in asks the name check again.
  const nameCheckFailure =
    !lookup.isError || sending || isSessionEndFailure(lookup.error)
      ? undefined
      : code === LookupRecipientErrorCode.RecipientNotFound
        ? "recipient_not_found"
        : code === LookupRecipientErrorCode.NameEnquiryUnavailable
          ? "name_check_unavailable"
          : code === LookupRecipientErrorCode.TooManyLookups
            ? "too_many_name_checks"
            : "review_unexpected";
  useTrackScenarioShown(
    nameCheckFailure === undefined
      ? lookup.data && TransferFlowScenario.RecipientFound
      : `transfer.${nameCheckFailure}`,
  );
  useTrackScenarioShown(
    nameCheckFailure === undefined && lookup.data?.firstTransfer
      ? TransferFlowScenario.FirstTransferToRecipient
      : undefined,
  );
  const refusedAt = lookup.errorUpdatedAt;
  const [waitedOutRefusalAt, setWaitedOutRefusalAt] = useState<number>();
  // Try again only after the minute the words ask for: the bank limits name checks on purpose.
  useEffect(() => {
    if (nameCheckFailure !== "too_many_name_checks") return;
    const timer = setTimeout(
      () => {
        setWaitedOutRefusalAt(refusedAt);
      },
      refusedAt + 60_000 - Date.now(),
    );
    return () => {
      clearTimeout(timer);
    };
  }, [nameCheckFailure, refusedAt]);
  if (lookup.isPending) return <Loader />;
  if (nameCheckFailure === "recipient_not_found")
    return (
      <BannerAction
        tone="negative"
        message={t("common.recipient_not_found.body")}
        action={{
          label: t("common.recipient_not_found.change_recipient"),
          onPress: () => {
            router.dismissTo("/transfer");
          },
        }}
      />
    );
  // One banner per refusal, whether or not Try again shows: a remounted one announces its words again.
  if (nameCheckFailure !== undefined)
    return (
      <BannerAction
        key={refusedAt}
        tone="negative"
        message={t(`common.${nameCheckFailure}.body`)}
        action={
          nameCheckFailure !== "too_many_name_checks" ||
          waitedOutRefusalAt === refusedAt
            ? {
                label: t(`common.${nameCheckFailure}.retry`),
                onPress: () => {
                  void lookup.refetch();
                },
              }
            : undefined
        }
      />
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
      <SectionReviewRecipient recipient={recipient} />
      <SectionReviewAmount draft={draft} />
    </Card>
  );
}
