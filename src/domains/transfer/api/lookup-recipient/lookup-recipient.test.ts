import { QueryClient } from "@tanstack/react-query";

import { transferKeys } from "../transfer.keys";
import {
  getLookupRecipientOptions,
  parseRecipientId,
} from "./lookup-recipient";
import {
  RecipientIdType,
  type LookupRecipientResponse,
} from "./lookup-recipient.type";

it("keeps a recipient's lookup when everything under transfers is invalidated", async () => {
  // No gc timers: a cache entry's 5-minute timer holds a single-file run open.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity } },
  });
  const lookupKey = getLookupRecipientOptions({
    idType: RecipientIdType.Mobile,
    idValue: "60123456789",
  }).queryKey;
  queryClient.setQueryData(lookupKey, {} as LookupRecipientResponse);

  await queryClient.invalidateQueries({ queryKey: transferKeys.all });

  expect(queryClient.getQueryState(lookupKey)?.isInvalidated).toBe(false);
});

it.each<[RecipientIdType, string, string | null]>([
  [RecipientIdType.Mobile, "012-345 6789", "+60123456789"],
  [RecipientIdType.Mobile, "60 11 2345 6789", "+601123456789"],
  [RecipientIdType.Mobile, "+60123456789", "+60123456789"],
  [RecipientIdType.Mobile, "03-2345 6789", null],
  [RecipientIdType.Mobile, "012-345 678", null],
  [RecipientIdType.Nric, "900101-14-5678", "900101145678"],
  [RecipientIdType.Nric, "90010114567", null],
  [RecipientIdType.Passport, "a1234567", "A1234567"],
  [RecipientIdType.Passport, "12345678", null],
  [RecipientIdType.Brn, "202001012345", "202001012345"],
  [RecipientIdType.Brn, "123456-a", "123456A"],
  [RecipientIdType.Brn, "12345A", null],
  [RecipientIdType.ArmyPolice, "t/123456", "T/123456"],
  [RecipientIdType.ArmyPolice, "RF 1234", "RF1234"],
  [RecipientIdType.ArmyPolice, "T123", null],
  [RecipientIdType.AccountNumber, "5123 4567 8901", "512345678901"],
  [RecipientIdType.AccountNumber, "1234567", null],
])("reads %s %p as %p", (idType, typedId, expectedId) => {
  expect(parseRecipientId(idType, typedId)).toBe(expectedId);
});
