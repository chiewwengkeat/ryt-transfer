import { transferKeys } from "@/domains/transfer/api/transfer.keys";
import { requestJson } from "@/shared/http/transport/transport";
import { queryOptions, useQuery } from "@tanstack/react-query";
import type { ListRecentRecipientsResponse } from "./list-recent-recipients.type";

export function getListRecentRecipientsOptions() {
  return queryOptions({
    queryKey: transferKeys.recentRecipients,
    queryFn: ({ signal }) =>
      requestJson<ListRecentRecipientsResponse>("/recipients/recent", {
        signal,
      }),
  });
}

export function useListRecentRecipients() {
  return useQuery({
    ...getListRecentRecipientsOptions(),
    select: (recents) => recents.items,
  });
}
