import { useListRecentRecipients } from "@/domains/transfer/api/list-recent-recipients/list-recent-recipients";
import { parseRecipientId } from "@/domains/transfer/api/lookup-recipient/lookup-recipient";
import { RecipientIdType } from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import SectionRecentRecipients from "@/domains/transfer/components/SectionRecentRecipients/SectionRecentRecipients";
import { useOfflineNotice } from "@/domains/transfer/hooks/use-offline-notice/use-offline-notice";
import { useTrackScenarioShown } from "@/domains/transfer/hooks/use-track-scenario-shown/use-track-scenario-shown";
import { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import {
  dispatchTransferFlow,
  TransferFlowActionType,
  TransferFlowStep,
  useTransferFlow,
} from "@/screens/transfer/flow-store/flow-store";
import { useQueryError } from "@/shared/hooks/use-query-error/use-query-error";
import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";
import Loader from "@/shared/ui/Loader/Loader";
import ViewScreenFrame from "@/shared/ui/ViewScreenFrame/ViewScreenFrame";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import BannerRecipientUnexpected from "./components/BannerRecipientUnexpected/BannerRecipientUnexpected";
import CardRecentRecipientChosen from "./components/CardRecentRecipientChosen/CardRecentRecipientChosen";
import SectionRecipientFields from "./components/SectionRecipientFields/SectionRecipientFields";

export default function TransferRecipientScreen() {
  const { t } = useTranslation("transfer");
  const { recentId: linkedRecentId } = useLocalSearchParams<{
    recentId?: string;
  }>();
  const [errorRecipientId, setErrorRecipientId] = useState<string>();
  const [errorBank, setErrorBank] = useState<string>();

  // Never an unconfirmed transfer's recipient: offering it again invites paying twice.
  const draftRecipient = useTransferFlow((flow) =>
    flow.step === TransferFlowStep.Editing ||
    flow.step === TransferFlowStep.Reviewing
      ? flow.draft.recipient
      : undefined,
  );
  const [idType, setIdType] = useState(
    draftRecipient?.idType ?? RecipientIdType.Mobile,
  );
  // A recent recipient's draft holds only its masked ID, which is nothing to type.
  const [typedId, setTypedId] = useState(
    draftRecipient?.recentId === undefined
      ? (draftRecipient?.idValue ?? "")
      : "",
  );
  const [bankCode, setBankCode] = useState(draftRecipient?.bankCode);
  const [chosenRecentId, setChosenRecentId] = useState(
    linkedRecentId ?? draftRecipient?.recentId,
  );
  const recents = useListRecentRecipients();
  const failureRecents = useQueryError(
    recents.error,
    recents.fetchStatus !== "idle",
  );
  const noticeOffline = useOfflineNotice();

  // Continue's offline line already explains a list that cannot load.
  const isOffline = noticeOffline !== undefined;
  const chosenRecent = recents.data?.find(
    (recent) => recent.recentId === chosenRecentId,
  );
  // Never the form in a chosen recent's place unannounced: a list that has yet to answer, or failed
  // offline where Continue's offline line says why, is waited for; else the catch-all stands until they type.
  // Not `isPending`: the form's own list refetches a failed list on mount, which would flip it back.
  const isChosenRecentAwaited =
    chosenRecentId !== undefined &&
    recents.data === undefined &&
    (!recents.isFetched || isOffline);
  const isChosenRecentMissing =
    chosenRecentId !== undefined &&
    chosenRecent === undefined &&
    !isChosenRecentAwaited;

  useTrackScenarioShown(
    errorRecipientId === undefined
      ? undefined
      : TransferScenarioId.BadlyFormedInput,
  );

  const recipientInput = (() => {
    if (chosenRecent !== undefined)
      return (
        <CardRecentRecipientChosen
          recent={chosenRecent}
          onChange={() => setChosenRecentId(undefined)}
        />
      );
    if (isChosenRecentAwaited) return <Loader />;
    return (
      <>
        <SectionRecipientFields
          idType={idType}
          typedId={typedId}
          idError={errorRecipientId}
          bankCode={bankCode}
          bankError={errorBank}
          onIdTypeChange={(chosenIdType) => {
            setIdType(chosenIdType);
            setTypedId("");
            setErrorRecipientId(undefined);
            setErrorBank(undefined);
            setChosenRecentId(undefined);
          }}
          onTypedIdChange={(recipientId) => {
            setTypedId(recipientId);
            setErrorRecipientId(undefined);
            setChosenRecentId(undefined);
          }}
          onBankChosen={(chosenBankCode) => {
            setBankCode(chosenBankCode);
            setErrorBank(undefined);
          }}
        />
        {((failureRecents !== null && !isOffline) || isChosenRecentMissing) && (
          <BannerRecipientUnexpected
            key={recents.errorUpdatedAt}
            failure={failureRecents}
            onRetry={() => recents.refetch({ cancelRefetch: false })}
          />
        )}
        <SectionRecentRecipients onRecentChosen={setChosenRecentId} />
      </>
    );
  })();

  function handleContinue() {
    if (chosenRecent !== undefined) {
      if (
        dispatchTransferFlow({
          type: TransferFlowActionType.RecipientChosen,
          recipient: {
            idType: chosenRecent.idType,
            idValue: chosenRecent.idValueMasked,
            recentId: chosenRecent.recentId,
          },
        })
      )
        router.push("/transfer/amount");
      return;
    }
    const idValue = parseRecipientId(idType, typedId);
    const isBankMissing =
      idType === RecipientIdType.AccountNumber && bankCode === undefined;
    setErrorRecipientId(
      idValue === null
        ? t(
            `common.badly_formed_input.${idType.toLowerCase() as Lowercase<RecipientIdType>}`,
          )
        : undefined,
    );
    setErrorBank(isBankMissing ? t("recipient.bank_missing") : undefined);
    if (idValue === null || isBankMissing) return;
    if (
      dispatchTransferFlow({
        type: TransferFlowActionType.RecipientChosen,
        recipient: {
          idType,
          idValue,
          ...(idType === RecipientIdType.AccountNumber && {
            bankCode,
          }),
        },
      })
    )
      router.push("/transfer/amount");
  }

  return (
    <>
      <Stack.Screen options={{ title: t("recipient.title") }} />
      <ViewScreenFrame
        footer={
          <ButtonPrimary
            label={t("recipient.continue")}
            loading={isChosenRecentAwaited}
            notice={noticeOffline}
            onPress={handleContinue}
          />
        }
      >
        {recipientInput}
      </ViewScreenFrame>
    </>
  );
}
