import { router, Stack } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { RecipientIdType } from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import ButtonPrimary from "@/shared/ui/ButtonPrimary/ButtonPrimary";
import FieldText from "@/shared/ui/FieldText/FieldText";
import ViewScreenFrame from "@/shared/ui/ViewScreenFrame/ViewScreenFrame";

import {
  dispatchTransferFlow,
  TransferFlowActionType,
  useTransferFlow,
} from "../state/transfer-flow";

export default function TransferRecipientScreen() {
  const { t } = useTranslation("transfer");
  const chosenMobile = useTransferFlow((flow) => flow.draft.recipient?.idValue);
  const [mobile, setMobile] = useState(chosenMobile ?? "");
  const [mobileError, setMobileError] = useState<string>();

  return (
    <>
      <Stack.Screen options={{ title: t("recipient.title") }} />
      <ViewScreenFrame
        footer={
          <ButtonPrimary
            label={t("recipient.continue")}
            onPress={() => {
              // A DuitNow mobile ID is a Malaysian mobile number: 1 and 8 or 9 digits after 0, 60 or +60.
              const national = /^(?:\+?60|0)(1\d{8,9})$/.exec(
                mobile.replace(/[\s-]/g, ""),
              )?.[1];
              if (national === undefined) {
                setMobileError(t("common.badly_formed_input.mobile"));
                return;
              }
              dispatchTransferFlow({
                type: TransferFlowActionType.RecipientChosen,
                recipient: {
                  idType: RecipientIdType.Mobile,
                  idValue: `+60${national}`,
                },
              });
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
