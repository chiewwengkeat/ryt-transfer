import type { QueryClient } from "@tanstack/react-query";

import { accountKeys } from "@/domains/account/api/account.keys";
import { resetTransferHistory } from "@/domains/transfer/api/list-transfers/list-transfers";

export async function refreshAccountAndHistoryAfterApproval(
  queryClient: QueryClient,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: accountKeys.all }),
    resetTransferHistory(queryClient),
  ]);
}
