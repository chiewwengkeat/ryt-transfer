import { useLookupRecipient } from "@/domains/transfer/api/lookup-recipient/lookup-recipient";
import {
  LookupRecipientErrorCode,
  type RecipientIdType,
} from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import { useTrackScenarioShown } from "@/domains/transfer/hooks/use-track-scenario-shown/use-track-scenario-shown";
import { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import RowDetail from "@/screens/transfer/components/RowDetail/RowDetail";
import {
  isTransferSentOrBeingSent,
  useTransferFlow,
} from "@/screens/transfer/flow-store/flow-store";
import type { TransferDraft } from "@/screens/transfer/flow-store/flow-store.type";
import { useQueryError } from "@/shared/hooks/use-query-error/use-query-error";
import {
  isSessionEndFailure,
  TransportError,
} from "@/shared/http/transport-error/transport-error";
import { formatMoney } from "@/shared/lib/money/money";
import BannerNotice from "@/shared/ui/BannerNotice/BannerNotice";
import Card from "@/shared/ui/Card/Card";
import Loader from "@/shared/ui/Loader/Loader";
import { READERS_OWN_FOCUS_WAIT_MS } from "@/shared/ui/TextHeading/TextHeading";
import { type NativeStackNavigationProp, useNavigation } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";
import BannerNameCheckFailed from "./components/BannerNameCheckFailed/BannerNameCheckFailed";
import BannerRecipientNotFound from "./components/BannerRecipientNotFound/BannerRecipientNotFound";

interface Props {
  draft: TransferDraft;
}
export default function SectionReviewDetails({ draft }: Props) {
  const { t } = useTranslation("transfer");
  const navigation =
    useNavigation<NativeStackNavigationProp<Record<string, object>>>();
  const [isFailureAnnouncementDue, setIsFailureAnnouncementDue] =
    useState(false);
  const [waitedOutRefusalAt, setWaitedOutRefusalAt] = useState<number>();

  const lookup = useLookupRecipient(draft.recipient);
  const isSending = useTransferFlow(isTransferSentOrBeingSent);
  const failureLookup = useQueryError(
    lookup.error,
    lookup.fetchStatus !== "idle",
  );

  const failureNameCheck = (() => {
    // Never while sending: "no money moved" can be false by then, and a retry mints a new recipient reference.
    // Never for the session's end either: sign-in asks the name check again.
    if (
      failureLookup === null ||
      isSending ||
      isSessionEndFailure(failureLookup)
    )
      return undefined;
    if (!(failureLookup instanceof TransportError))
      return TransferScenarioId.ReviewUnexpected;
    switch (failureLookup.code) {
      case LookupRecipientErrorCode.RecipientNotFound:
        return TransferScenarioId.RecipientNotFound;
      case LookupRecipientErrorCode.NameEnquiryUnavailable:
        return TransferScenarioId.NameCheckUnavailable;
      case LookupRecipientErrorCode.TooManyLookups:
        return TransferScenarioId.TooManyNameChecks;
      case undefined:
      default:
        return TransferScenarioId.ReviewUnexpected;
    }
  })();
  const refusedAt = lookup.errorUpdatedAt;

  useTrackScenarioShown(
    failureNameCheck === undefined
      ? lookup.data && TransferScenarioId.RecipientFound
      : failureNameCheck,
  );
  useTrackScenarioShown(
    failureNameCheck === undefined && lookup.data?.firstTransfer
      ? TransferScenarioId.FirstTransferToRecipient
      : undefined,
  );
  // Said while review opens, a failure is cut off by the screen reader's own focus move, which follows the push.
  useEffect(() => {
    let timerAnnouncement: ReturnType<typeof setTimeout> | undefined;
    const stopListening = navigation.addListener(
      "transitionEnd",
      ({ data }) => {
        if (data.closing) return;
        timerAnnouncement = setTimeout(
          () => {
            setIsFailureAnnouncementDue(true);
          },
          Platform.select({ ios: READERS_OWN_FOCUS_WAIT_MS, default: 0 }),
        );
      },
    );
    return () => {
      stopListening();
      clearTimeout(timerAnnouncement);
    };
  }, [navigation]);
  // Try again only after the minute the words ask for: the bank limits name checks on purpose.
  useEffect(() => {
    if (failureNameCheck !== TransferScenarioId.TooManyNameChecks) return;
    const timer = setTimeout(
      () => {
        setWaitedOutRefusalAt(refusedAt);
      },
      refusedAt + 60_000 - Date.now(),
    );
    return () => {
      clearTimeout(timer);
    };
  }, [failureNameCheck, refusedAt]);

  const isNameCheckFailedShown =
    failureNameCheck !== undefined &&
    failureNameCheck !== TransferScenarioId.RecipientNotFound;
  if (lookup.isPending && failureLookup === null) return <Loader />;
  return (
    <>
      {failureNameCheck === TransferScenarioId.RecipientNotFound && (
        <BannerRecipientNotFound announce={isFailureAnnouncementDue} />
      )}
      {isNameCheckFailedShown && (
        <BannerNameCheckFailed
          // One banner per refusal, whether or not Try again shows: a remounted one announces its words again.
          key={refusedAt}
          scenario={failureNameCheck}
          announce={isFailureAnnouncementDue}
          canRetry={
            failureNameCheck !== TransferScenarioId.TooManyNameChecks ||
            waitedOutRefusalAt === refusedAt
          }
          onRetry={() => lookup.refetch({ cancelRefetch: false })}
        />
      )}
      {failureNameCheck === undefined && lookup.data && (
        <Card>
          <RowDetail
            label={t("section_review_details.recipient_name")}
            value={lookup.data.recipient.registeredName}
          />
          {lookup.data.firstTransfer && (
            <BannerNotice
              message={t("common.first_transfer_to_recipient.body")}
            />
          )}
          <RowDetail
            label={t("common.detail_rows.bank")}
            value={lookup.data.recipient.bankName}
          />
          <RowDetail
            label={t(
              `common.detail_rows.${lookup.data.recipient.idType.toLowerCase() as Lowercase<RecipientIdType>}`,
            )}
            value={lookup.data.recipient.idValueMasked}
          />
          <RowDetail
            label={t("common.detail_rows.amount")}
            value={formatMoney(draft.amount)}
          />
          {draft.note !== undefined && (
            <RowDetail
              label={t("common.detail_rows.note")}
              value={draft.note}
            />
          )}
        </Card>
      )}
    </>
  );
}
