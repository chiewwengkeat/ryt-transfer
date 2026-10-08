import { router, Stack } from "expo-router";
import { HeaderBackButton } from "expo-router/react-navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { parseRecipientId } from "@/domains/transfer/api/lookup-recipient/lookup-recipient";
import { RecipientIdType } from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";
import FieldText from "@/shared/ui/FieldText/FieldText";
import ViewScreenFrame from "@/shared/ui/ViewScreenFrame/ViewScreenFrame";

import {
  dispatchTransferFlow,
  TransferFlowActionType,
  TransferFlowStep,
  useTransferFlow,
} from "../state/transfer-flow";

export default function TransferRecipientScreen() {
  const { t } = useTranslation("transfer");
  // Never an unconfirmed transfer's number: offering it again invites paying twice.
  const chosenMobile = useTransferFlow((flow) =>
    flow.step === TransferFlowStep.Editing ||
    flow.step === TransferFlowStep.Reviewing
      ? flow.draft.recipient?.idValue
      : undefined,
  );
  const [mobile, setMobile] = useState(chosenMobile ?? "");
  const [mobileError, setMobileError] = useState<string>();

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
              const mobileId = parseRecipientId(RecipientIdType.Mobile, mobile);
              if (mobileId === null) {
                setMobileError(t("common.badly_formed_input.mobile"));
                return;
              }
              if (
                dispatchTransferFlow({
                  type: TransferFlowActionType.RecipientChosen,
                  recipient: {
                    idType: RecipientIdType.Mobile,
                    idValue: mobileId,
                  },
                })
              )
                router.push("/transfer/amount");
            }}
          />
        }
      >
        <FieldText
          label={t("recipient.mobile_label")}
          placeholder={t("recipient.mobile_placeholder")}
          value={mobile}
          onChangeText={(text) => {
            setMobile(text);
            setMobileError(undefined);
          }}
          error={mobileError}
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
        />
      </ViewScreenFrame>
    </>
  );
}
