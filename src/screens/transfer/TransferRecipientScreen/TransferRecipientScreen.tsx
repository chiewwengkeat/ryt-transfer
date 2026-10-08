import { router, Stack } from "expo-router";
import { HeaderBackButton } from "expo-router/react-navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { parseRecipientId } from "@/domains/transfer/api/lookup-recipient/lookup-recipient";
import { RecipientIdType } from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";
import ViewScreenFrame from "@/shared/ui/ViewScreenFrame/ViewScreenFrame";

import {
  dispatchTransferFlow,
  TransferFlowActionType,
  TransferFlowStep,
  useTransferFlow,
} from "../state/transfer-flow";
import ButtonContacts from "./components/ButtonContacts/ButtonContacts";
import ChipIdType from "./components/ChipIdType/ChipIdType";
import FieldBank from "./components/FieldBank/FieldBank";
import FieldRecipientId from "./components/FieldRecipientId/FieldRecipientId";

export default function TransferRecipientScreen() {
  const { t } = useTranslation("transfer");
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
  const [typedId, setTypedId] = useState(draftRecipient?.idValue ?? "");
  const [bankCode, setBankCode] = useState(draftRecipient?.bankCode);
  const [idError, setIdError] = useState<string>();
  const [bankError, setBankError] = useState<string>();

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
            onPress={() => {
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
        <ChipIdType
          idType={idType}
          onIdTypeChange={(chosenIdType) => {
            setIdType(chosenIdType);
            setTypedId("");
            setIdError(undefined);
            setBankError(undefined);
          }}
        />
        <FieldRecipientId
          idType={idType}
          value={typedId}
          onChangeText={(text) => {
            setTypedId(text);
            setIdError(undefined);
          }}
          error={idError}
        />
        {idType === RecipientIdType.Mobile && (
          <ButtonContacts
            onMobilePicked={(mobileId) => {
              setTypedId(mobileId);
              setIdError(undefined);
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
      </ViewScreenFrame>
    </>
  );
}
