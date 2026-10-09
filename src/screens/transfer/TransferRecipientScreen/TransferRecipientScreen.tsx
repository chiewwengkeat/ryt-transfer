import { router, Stack, useLocalSearchParams } from "expo-router";
import { HeaderBackButton } from "expo-router/react-navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useListRecentRecipients } from "@/domains/transfer/api/list-recent-recipients/list-recent-recipients";
import { parseRecipientId } from "@/domains/transfer/api/lookup-recipient/lookup-recipient";
import { RecipientIdType } from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import SectionRecentRecipients from "@/domains/transfer/components/SectionRecentRecipients/SectionRecentRecipients";
import { useTrackScenarioShown } from "@/domains/transfer/hooks/use-track-scenario-shown";
import { TransferScenarioId } from "@/domains/transfer/lib/transfer-scenario-id/transfer-scenario-id";
import { useIsOffline } from "@/shared/platform/offline";
import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";
import Loader from "@/shared/ui/Loader/Loader";
import ViewScreenFrame from "@/shared/ui/ViewScreenFrame/ViewScreenFrame";

import {
  dispatchTransferFlow,
  TransferFlowActionType,
  TransferFlowStep,
  useTransferFlow,
} from "@/screens/transfer/flow-store/flow-store";
import BannerRecipientUnexpected from "./components/BannerRecipientUnexpected/BannerRecipientUnexpected";
import ButtonContacts from "./components/ButtonContacts/ButtonContacts";
import CardRecentRecipientChosen from "./components/CardRecentRecipientChosen/CardRecentRecipientChosen";
import ChipIdType from "./components/ChipIdType/ChipIdType";
import FieldBank from "./components/FieldBank/FieldBank";
import FieldRecipientId from "./components/FieldRecipientId/FieldRecipientId";

export default function TransferRecipientScreen() {
  const { t } = useTranslation("transfer");
  const { recentId: linkedRecentId } = useLocalSearchParams<{
    recentId?: string;
  }>();
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
  const [idError, setIdError] = useState<string>();
  useTrackScenarioShown(
    idError === undefined ? undefined : TransferScenarioId.BadlyFormedInput,
  );
  const [bankError, setBankError] = useState<string>();
  const recents = useListRecentRecipients();
  // The shell's offline notice already explains a list that cannot load.
  const offline = useIsOffline();
  const chosenRecent = recents.data?.find(
    (recent) => recent.recentId === chosenRecentId,
  );
  // Never the form in a chosen recent's place unannounced: a list that has yet to answer, or failed
  // offline where the shell's notice says why, is waited for; else the catch-all stands until they type.
  // Not `isPending`: the form's own list refetches a failed list on mount, which would flip it back.
  const chosenRecentAwaited =
    chosenRecentId !== undefined &&
    recents.data === undefined &&
    (!recents.isFetched || offline);
  const chosenRecentMissing =
    chosenRecentId !== undefined &&
    chosenRecent === undefined &&
    !chosenRecentAwaited;

  return (
    <>
      <Stack.Screen
        options={{
          title: t("recipient.title"),
          // The flow's first step: the root stack's header, which would go back, is hidden over the flow.
          headerLeft: (props) => (
            <HeaderBackButton
              {...props}
              displayMode="minimal"
              accessibilityLabel={t("recipient.home")}
              onPress={() => {
                router.dismissTo("/");
              }}
            />
          ),
        }}
      />
      <ViewScreenFrame
        footer={
          <ButtonPrimary
            label={t("recipient.continue")}
            loading={chosenRecentAwaited}
            onPress={() => {
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
              const bankMissing =
                idType === RecipientIdType.AccountNumber &&
                bankCode === undefined;
              setIdError(
                idValue === null
                  ? t(
                      `common.badly_formed_input.${idType.toLowerCase() as Lowercase<RecipientIdType>}`,
                    )
                  : undefined,
              );
              setBankError(
                bankMissing ? t("recipient.bank_missing") : undefined,
              );
              if (idValue === null || bankMissing) return;
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
            }}
          />
        }
      >
        {chosenRecent !== undefined ? (
          <CardRecentRecipientChosen
            recent={chosenRecent}
            onChange={() => {
              setChosenRecentId(undefined);
            }}
          />
        ) : chosenRecentAwaited ? (
          <Loader />
        ) : (
          <>
            <ChipIdType
              idType={idType}
              onIdTypeChange={(chosenIdType) => {
                setIdType(chosenIdType);
                setTypedId("");
                setIdError(undefined);
                setBankError(undefined);
                setChosenRecentId(undefined);
              }}
            />
            <FieldRecipientId
              idType={idType}
              value={typedId}
              onChangeText={(text) => {
                setTypedId(text);
                setIdError(undefined);
                setChosenRecentId(undefined);
              }}
              error={idError}
            />
            {idType === RecipientIdType.Mobile && (
              <ButtonContacts
                onMobilePicked={(mobileId) => {
                  setTypedId(mobileId);
                  setIdError(undefined);
                  setChosenRecentId(undefined);
                }}
              />
            )}
            {idType === RecipientIdType.AccountNumber && (
              <FieldBank
                bankCode={bankCode}
                onBankChosen={(chosenBankCode) => {
                  setBankCode(chosenBankCode);
                  setBankError(undefined);
                }}
                error={bankError}
              />
            )}
            {((recents.isError && !offline) || chosenRecentMissing) && (
              <BannerRecipientUnexpected
                failure={recents.error}
                onRetry={() => {
                  void recents.refetch();
                }}
              />
            )}
            <SectionRecentRecipients onRecentChosen={setChosenRecentId} />
          </>
        )}
      </ViewScreenFrame>
    </>
  );
}
