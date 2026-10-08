import { QueryClient } from "@tanstack/react-query";

import { transferKeys } from "../transfer.keys";
import {
  getLookupRecipientOptions,
  parseRecipientId,
  RECIPIENT_ID_FORMATS,
  RecipientIdCharacters,
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
  [RecipientIdType.Nric, "900101/14/5678", "900101145678"],
  [RecipientIdType.Nric, "90010114567", null],
  [RecipientIdType.Passport, "a1234567", "A1234567"],
  [RecipientIdType.Passport, "12345678", null],
  [RecipientIdType.Brn, "202001012345", "202001012345"],
  [RecipientIdType.Brn, "123456-a", "123456A"],
  [RecipientIdType.Brn, "12345A", null],
  [RecipientIdType.ArmyPolice, "t/123456", "T123456"],
  [RecipientIdType.ArmyPolice, "T123456", "T123456"],
  [RecipientIdType.ArmyPolice, "RF/1234", "RF1234"],
  [RecipientIdType.ArmyPolice, "RF 1234", "RF1234"],
  [RecipientIdType.ArmyPolice, "T123", null],
  [RecipientIdType.AccountNumber, "5123 4567 8901", "512345678901"],
  [RecipientIdType.AccountNumber, "1234567", null],
])("reads %s %p as %p", (idType, typedId, expectedId) => {
  expect(parseRecipientId(idType, typedId)).toBe(expectedId);
});

it.each<[RecipientIdType, string]>([
  [RecipientIdType.Mobile, "+601123456789"],
  [RecipientIdType.Nric, "900101145678"],
  [RecipientIdType.Passport, "A12345678901"],
  [RecipientIdType.Brn, "202001012345"],
  [RecipientIdType.ArmyPolice, "RFT12345678"],
  [RecipientIdType.AccountNumber, "12345678901234567"],
])(
  "takes a %s ID as long as %p, with a space between every character, and none longer",
  (idType, longestId) => {
    expect(RECIPIENT_ID_FORMATS[idType].longestIdLength).toBe(longestId.length);
    expect(parseRecipientId(idType, [...longestId].join(" "))).toBe(longestId);
    expect(parseRecipientId(idType, `${longestId}0`)).toBeNull();
  },
);

const CHARACTERS_ON_KEYBOARD = {
  [RecipientIdCharacters.Digits]: /^\d+$/,
  [RecipientIdCharacters.PlusAndDigits]: /^\+?\d+$/,
  [RecipientIdCharacters.LettersAndDigits]: /^[A-Z\d]+$/,
};

it.each<[RecipientIdType, string, string]>([
  [RecipientIdType.Mobile, "+60123456789", "+6012345678A"],
  [RecipientIdType.Nric, "900101145678", "90010114567A"],
  [RecipientIdType.Passport, "A1234567", "A123456+"],
  [RecipientIdType.Brn, "1234567A", "1234567+"],
  [RecipientIdType.ArmyPolice, "RF1234", "RF123+"],
  [RecipientIdType.AccountNumber, "512345678901", "51234567890A"],
])(
  "keys a %s ID on a keyboard holding every character its rule takes",
  (idType, idTheRuleTakes, idWithOtherCharacter) => {
    const keyboardCharacters =
      CHARACTERS_ON_KEYBOARD[RECIPIENT_ID_FORMATS[idType].characters];

    expect(parseRecipientId(idType, idTheRuleTakes)).toMatch(
      keyboardCharacters,
    );
    expect(parseRecipientId(idType, idWithOtherCharacter)).toBeNull();
  },
);
