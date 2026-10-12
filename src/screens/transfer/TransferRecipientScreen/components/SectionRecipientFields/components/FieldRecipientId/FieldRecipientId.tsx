import {
  RECIPIENT_ID_FORMATS,
  RecipientIdCharacters,
} from "@/domains/transfer/api/lookup-recipient/lookup-recipient";
import type { RecipientIdType } from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import FieldText from "@/shared/ui/FieldText/FieldText";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TextInputProps } from "react-native";

interface Props {
  idType: RecipientIdType;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
}
export default function FieldRecipientId({ idType, ...fieldProps }: Props) {
  const { t } = useTranslation("transfer");
  const [isFieldFocused, setIsFieldFocused] = useState(false);

  const { characters, longestIdLength } = RECIPIENT_ID_FORMATS[idType];

  const keyboardProps = (
    {
      [RecipientIdCharacters.PlusAndDigits]: {
        keyboardType: "phone-pad",
        textContentType: "telephoneNumber",
        autoComplete: "tel",
        placeholder: t("field_recipient_id.mobile_placeholder"),
      },
      [RecipientIdCharacters.Digits]: { keyboardType: "number-pad" },
      [RecipientIdCharacters.LettersAndDigits]: {
        autoCapitalize: "characters",
      },
    } satisfies Record<RecipientIdCharacters, TextInputProps>
  )[characters];
  return (
    <FieldText
      // A new field per keyboard, taking the old one's focus: iOS keeps a focused field's keys, and Android its case.
      key={characters}
      autoFocus={isFieldFocused}
      onFocus={() => setIsFieldFocused(true)}
      onBlur={() => setIsFieldFocused(false)}
      {...fieldProps}
      {...keyboardProps}
      // A separator may sit between any two characters, so no typed ID the bank's rule takes is cut.
      maxLength={2 * longestIdLength - 1}
      label={t(
        `field_recipient_id.label.${idType.toLowerCase() as Lowercase<RecipientIdType>}`,
      )}
      autoCorrect={false}
    />
  );
}
