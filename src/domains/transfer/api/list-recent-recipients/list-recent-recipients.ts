import { queryOptions, useQuery } from "@tanstack/react-query";

import { requestJson } from "@/shared/http/transport/transport";

import { transferKeys } from "../transfer.keys";
import type { ListRecentRecipientsResponse } from "./list-recent-recipients.type";

export const getListRecentRecipientsOptions = () =>
  queryOptions({
    queryKey: transferKeys.recentRecipients,
    queryFn: ({ signal }) =>
      requestJson<ListRecentRecipientsResponse>("/recipients/recent", {
        signal,
      }),
  });

export function useListRecentRecipients() {
  return useQuery({
    ...getListRecentRecipientsOptions(),
    select: (recents) => recents.items,
  });
}
