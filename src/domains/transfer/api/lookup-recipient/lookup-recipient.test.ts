import { QueryClient } from "@tanstack/react-query";

import { transferKeys } from "../transfer.keys";
import { getLookupRecipientOptions } from "./lookup-recipient";
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
