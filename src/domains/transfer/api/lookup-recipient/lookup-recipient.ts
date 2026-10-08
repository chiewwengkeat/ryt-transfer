import { queryOptions, useQuery } from "@tanstack/react-query";

import { requestJson } from "@/shared/http/transport";

import { transferKeys } from "../transfer.keys";
import type {
  LookupRecipientRequest,
  LookupRecipientResponse,
  RecipientIdType,
} from "./lookup-recipient.type";

export const getLookupRecipientOptions = (
  recipient: Extract<LookupRecipientRequest, { idType: RecipientIdType }>,
) =>
  queryOptions({
    queryKey: transferKeys.lookup(recipient),
    queryFn: ({ signal }) =>
      requestJson<LookupRecipientResponse>("/recipients/lookup", {
        method: "POST",
        body: recipient,
        signal,
      }),
    // Each answer carries a new reference to create the transfer against, so review keeps the one it showed
    // until it closes, and opening it again asks afresh.
    staleTime: Infinity,
    gcTime: 0,
  });

export function useLookupRecipient(
  recipient: Extract<LookupRecipientRequest, { idType: RecipientIdType }>,
) {
  return useQuery(getLookupRecipientOptions(recipient));
}
