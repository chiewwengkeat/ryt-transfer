import { queryOptions, useQuery } from "@tanstack/react-query";

import { requestJson } from "@/shared/http/transport";

import { transferKeys } from "../transfer.keys";
import {
  type LookupRecipientRequest,
  type LookupRecipientResponse,
  RecipientIdType,
} from "./lookup-recipient.type";

// The bank's own rules: the fake bank imports them, so the app never accepts an ID the bank refuses.
const RECIPIENT_ID_FORMATS: Record<RecipientIdType, RegExp> = {
  [RecipientIdType.Mobile]: /^(?:\+?60|0)(1\d{8,9})$/,
  [RecipientIdType.Nric]: /^\d{12}$/,
  [RecipientIdType.Passport]: /^[A-Z][A-Z0-9]{5,11}$/,
  [RecipientIdType.Brn]: /^(?:\d{12}|\d{6,7}[A-Z])$/,
  [RecipientIdType.ArmyPolice]: /^[A-Z]{1,3}\d{4,8}$/,
  [RecipientIdType.AccountNumber]: /^\d{8,17}$/,
};

export function parseRecipientId(idType: RecipientIdType, typedId: string) {
  const compactId = typedId.replace(/[\s/-]/g, "").toUpperCase();
  const match = RECIPIENT_ID_FORMATS[idType].exec(compactId);
  if (match === null) return null;
  // One form however the number was typed, so the bank sees one recipient.
  return idType === RecipientIdType.Mobile ? `+60${match[1]}` : compactId;
}

export const getLookupRecipientOptions = (
  recipient: Extract<LookupRecipientRequest, { idType: RecipientIdType }> & {
    recentId?: string;
  },
) =>
  queryOptions({
    // One account number at two banks is two recipients.
    queryKey: [
      ...transferKeys.lookup(recipient),
      recipient.bankCode ?? null,
      recipient.recentId ?? null,
    ],
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

export function useLookupRecipient(
  recipient: Extract<LookupRecipientRequest, { idType: RecipientIdType }> & {
    recentId?: string;
  },
) {
  return useQuery(getLookupRecipientOptions(recipient));
}
