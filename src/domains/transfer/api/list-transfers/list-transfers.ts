import type { InfiniteData, QueryClient } from "@tanstack/react-query";

import type { Transfer } from "../get-transfer/get-transfer.type";
import { transferKeys } from "../transfer.keys";
import type { ListTransfersResponse } from "./list-transfers.type";

// After a transfer: a page fetch already under way would land on pages the new transfer has shifted.
export async function resetTransferHistory(queryClient: QueryClient) {
  await queryClient.cancelQueries({ queryKey: transferKeys.historyAll });
  queryClient.setQueriesData<InfiniteData<ListTransfersResponse>>(
    { queryKey: transferKeys.historyAll },
    (history) =>
      history && {
        pages: history.pages.slice(0, 1),
        pageParams: history.pageParams.slice(0, 1),
      },
  );
  await queryClient.invalidateQueries({ queryKey: transferKeys.historyAll });
}

export async function patchTransferInHistory(
  queryClient: QueryClient,
  transfer: Transfer,
) {
  await queryClient.cancelQueries({ queryKey: transferKeys.historyAll });
  queryClient.setQueriesData<InfiniteData<ListTransfersResponse>>(
    { queryKey: transferKeys.historyAll },
    (history) =>
      history && {
        ...history,
        pages: history.pages.map((page) => ({
          ...page,
          items: page.items.map((item) =>
            item.transferId === transfer.transferId &&
            item.version < transfer.version
              ? transfer
              : item,
          ),
        })),
      },
  );
}
