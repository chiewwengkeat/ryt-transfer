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
import ChipIdType from "./components/ChipIdType/ChipIdType";
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
  const [idError, setIdError] = useState<string>();

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
              if (idValue === null) {
                setIdError(
                  t(
                    `common.badly_formed_input.${idType.toLowerCase() as Lowercase<RecipientIdType>}`,
                  ),
                );
                return;
              }
              if (
                dispatchTransferFlow({
                  type: TransferFlowActionType.RecipientChosen,
                  recipient: { idType, idValue },
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
      </ViewScreenFrame>
    </>
  );
}
