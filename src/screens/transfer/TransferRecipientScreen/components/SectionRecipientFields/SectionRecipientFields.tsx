import { RecipientIdType } from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import ButtonContacts from "./components/ButtonContacts/ButtonContacts";
import ChipIdType from "./components/ChipIdType/ChipIdType";
import FieldBank from "./components/FieldBank/FieldBank";
import FieldRecipientId from "./components/FieldRecipientId/FieldRecipientId";

interface Props {
  idType: RecipientIdType;
  typedId: string;
  idError?: string;
  bankCode: string | undefined;
  bankError?: string;
  onIdTypeChange: (idType: RecipientIdType) => void;
  onTypedIdChange: (recipientId: string) => void;
  onBankChosen: (bankCode: string) => void;
}
export default function SectionRecipientFields({
  idType,
  typedId,
  idError,
  bankCode,
  bankError,
  onIdTypeChange,
  onTypedIdChange,
  onBankChosen,
}: Props) {
  return (
    <>
      <ChipIdType idType={idType} onIdTypeChange={onIdTypeChange} />
      <FieldRecipientId
        idType={idType}
        value={typedId}
        onChangeText={onTypedIdChange}
        error={idError}
      />
      {idType === RecipientIdType.Mobile && (
        <ButtonContacts onMobilePicked={onTypedIdChange} />
      )}
      {idType === RecipientIdType.AccountNumber && (
        <FieldBank
          bankCode={bankCode}
          onBankChosen={onBankChosen}
          error={bankError}
        />
      )}
    </>
  );
}
