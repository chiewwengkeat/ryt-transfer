import { useTranslation } from "react-i18next";
import type { TextInputProps } from "react-native";

import {
  RECIPIENT_ID_FORMATS,
  RecipientIdCharacters,
} from "@/domains/transfer/api/lookup-recipient/lookup-recipient";
import type { RecipientIdType } from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import FieldText from "@/shared/ui/FieldText/FieldText";

interface Props {
  idType: RecipientIdType;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
}
export default function FieldRecipientId({ idType, ...fieldProps }: Props) {
  const { t } = useTranslation("transfer");
  const { characters, longestIdLength } = RECIPIENT_ID_FORMATS[idType];
  const keyboardProps = (
    {
      [RecipientIdCharacters.PlusAndDigits]: {
        keyboardType: "phone-pad",
        textContentType: "telephoneNumber",
        autoComplete: "tel",
        placeholder: t("recipient.mobile_placeholder"),
      },
      [RecipientIdCharacters.Digits]: { keyboardType: "number-pad" },
      [RecipientIdCharacters.LettersAndDigits]: {
        autoCapitalize: "characters",
      },
    } satisfies Record<RecipientIdCharacters, TextInputProps>
  )[characters];

  return (
    <FieldText
      {...fieldProps}
      {...keyboardProps}
      // A separator may sit between any two characters, so no typed ID the bank's rule takes is cut.
      maxLength={2 * longestIdLength - 1}
      label={t(
        `recipient.id_label.${idType.toLowerCase() as Lowercase<RecipientIdType>}`,
      )}
      autoCorrect={false}
    />
  );
}
