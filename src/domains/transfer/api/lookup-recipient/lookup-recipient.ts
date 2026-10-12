import { transferKeys } from "@/domains/transfer/api/transfer.keys";
import { requestJson } from "@/shared/http/transport/transport";
import { queryOptions, useQuery } from "@tanstack/react-query";
import {
  type LookupRecipientInput,
  type LookupRecipientRequest,
  type LookupRecipientResponse,
  RecipientIdType,
} from "./lookup-recipient.type";

export enum RecipientIdCharacters {
  Digits = "digits",
  PlusAndDigits = "plus_and_digits",
  LettersAndDigits = "letters_and_digits",
}

// The bank's own rules: the mock bank imports them, so the app never accepts an ID the bank refuses.
export const RECIPIENT_ID_FORMATS: Record<
  RecipientIdType,
  {
    pattern: RegExp;
    characters: RecipientIdCharacters;
    longestIdLength: number;
  }
> = {
  [RecipientIdType.Mobile]: {
    pattern: /^(?:\+?60|0)(1\d{8,9})$/,
    characters: RecipientIdCharacters.PlusAndDigits,
    longestIdLength: 13,
  },
  [RecipientIdType.Nric]: {
    pattern: /^\d{12}$/,
    characters: RecipientIdCharacters.Digits,
    longestIdLength: 12,
  },
  [RecipientIdType.Passport]: {
    pattern: /^[A-Z][A-Z0-9]{5,11}$/,
    characters: RecipientIdCharacters.LettersAndDigits,
    longestIdLength: 12,
  },
  [RecipientIdType.Brn]: {
    pattern: /^(?:\d{12}|\d{6,7}[A-Z])$/,
    characters: RecipientIdCharacters.LettersAndDigits,
    longestIdLength: 12,
  },
  [RecipientIdType.ArmyPolice]: {
    pattern: /^[A-Z]{1,3}\d{4,8}$/,
    characters: RecipientIdCharacters.LettersAndDigits,
    longestIdLength: 11,
  },
  [RecipientIdType.AccountNumber]: {
    pattern: /^\d{8,17}$/,
    characters: RecipientIdCharacters.Digits,
    longestIdLength: 17,
  },
};

export function parseRecipientId(idType: RecipientIdType, typedId: string) {
  const compactId = typedId.replace(/[\s/-]/g, "").toUpperCase();
  const match = RECIPIENT_ID_FORMATS[idType].pattern.exec(compactId);
  if (match === null) return null;
  // One form however the number was typed, so the bank sees one recipient.
  return idType === RecipientIdType.Mobile ? `+60${match[1]}` : compactId;
}

export function getLookupRecipientOptions(recipient: LookupRecipientInput) {
  return queryOptions({
    queryKey: transferKeys.lookup(recipient),
    queryFn: ({ signal }) =>
      requestJson<LookupRecipientResponse>("/recipients/lookup", {
        method: "POST",
        // A recent recipient's draft holds only the masked ID, so the bank finds it by its recent id.
        body: (recipient.recentId === undefined
          ? {
              idType: recipient.idType,
              idValue: recipient.idValue,
              bankCode: recipient.bankCode,
            }
          : { recentId: recipient.recentId }) satisfies LookupRecipientRequest,
        signal,
      }),
    // Each answer mints a new recipient reference: review keeps the one it showed, and reopening asks afresh.
    staleTime: Infinity,
    gcTime: 0,
  });
}

export function useLookupRecipient(recipient: LookupRecipientInput) {
  return useQuery(getLookupRecipientOptions(recipient));
}
