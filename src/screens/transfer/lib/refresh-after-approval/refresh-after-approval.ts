import { accountKeys } from "@/domains/account/api/account.keys";
import { getListRecentRecipientsOptions } from "@/domains/transfer/api/list-recent-recipients/list-recent-recipients";
import { resetTransferHistory } from "@/domains/transfer/api/list-transfers/list-transfers";
import type { QueryClient } from "@tanstack/react-query";

export async function refreshAccountHistoryAndRecentRecipientsAfterApproval(
  queryClient: QueryClient,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: accountKeys.all }),
    resetTransferHistory(queryClient),
    queryClient.invalidateQueries({
      queryKey: getListRecentRecipientsOptions().queryKey,
    }),
  ]);
}
