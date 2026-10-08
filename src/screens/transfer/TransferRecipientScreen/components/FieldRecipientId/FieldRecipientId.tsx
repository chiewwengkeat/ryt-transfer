import { useTranslation } from "react-i18next";
import type { TextInputProps } from "react-native";

import { RecipientIdType } from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import FieldText from "@/shared/ui/FieldText/FieldText";

interface Props {
  idType: RecipientIdType;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
}
export default function FieldRecipientId({ idType, ...fieldProps }: Props) {
  const { t } = useTranslation("transfer");
  // No maxLength: a pasted ID keeps the spaces and dashes the bank's rules strip, and a cap would cut it.
  const inputProps = (
    {
      [RecipientIdType.Mobile]: {
        keyboardType: "phone-pad",
        textContentType: "telephoneNumber",
        autoComplete: "tel",
        placeholder: t("recipient.mobile_placeholder"),
      },
      [RecipientIdType.Nric]: { keyboardType: "number-pad" },
      [RecipientIdType.AccountNumber]: { keyboardType: "number-pad" },
      [RecipientIdType.Passport]: { autoCapitalize: "characters" },
      [RecipientIdType.Brn]: { autoCapitalize: "characters" },
      [RecipientIdType.ArmyPolice]: { autoCapitalize: "characters" },
    } satisfies Record<RecipientIdType, TextInputProps>
  )[idType];

  return (
    <FieldText
      {...fieldProps}
      {...inputProps}
      label={t(
        `recipient.id_label.${idType.toLowerCase() as Lowercase<RecipientIdType>}`,
      )}
      autoCorrect={false}
    />
  );
}
