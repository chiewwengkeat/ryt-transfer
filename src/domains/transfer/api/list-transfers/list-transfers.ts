import {
  infiniteQueryOptions,
  useInfiniteQuery,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";

import { requestJson } from "@/shared/http/transport/transport";
import { toMalaysianDateKey } from "@/shared/lib/dates/dates";
import { parseWireAmount } from "@/shared/lib/money/money";
import { trackEvent } from "@/shared/observability/observability/observability";

import {
  TransferFunds,
  type Transfer,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import { transferKeys } from "@/domains/transfer/api/transfer.keys";
import type { ListTransfersResponse } from "./list-transfers.type";

// As the bank's day net counts it, so a day's rows add up to its header: a pending refund has not come back yet.
export const MONEY_MOVED_SIGN = {
  [TransferFunds.NotDebited]: 0,
  [TransferFunds.Debited]: -1,
  [TransferFunds.RefundPending]: -1,
  [TransferFunds.Refunded]: 0,
  [TransferFunds.Credited]: 1,
} satisfies Record<TransferFunds, -1 | 0 | 1>;

export const getListTransfersOptions = () =>
  infiniteQueryOptions({
    queryKey: transferKeys.history(),
    queryFn: async ({ pageParam, signal }) => {
      const searchParams = new URLSearchParams({ limit: "30" });
      if (pageParam !== null) searchParams.set("cursor", pageParam);
      const page = await requestJson<ListTransfersResponse>(
        `/transfers?${searchParams.toString()}`,
        { signal },
      );
      const unreadableAmountCount = [
        ...page.items.map(({ amount }) => amount),
        ...page.days.map(({ net }) => net),
      ].filter((amount) => parseWireAmount(amount) === null).length;
      if (unreadableAmountCount > 0)
        trackEvent("unreadable_amount", {
          boundary: "transfer_history",
          count: unreadableAmountCount,
        });
      const unreadableTimeCount = page.items.filter(
        ({ createdAt }) => toMalaysianDateKey(createdAt) === null,
      ).length;
      if (unreadableTimeCount > 0)
        trackEvent("transfer_history_unreadable_times", {
          count: unreadableTimeCount,
        });
      return page;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    // A refetch replays every loaded page, so history never refetches by itself and its reset fetches the newest page
    // alone. Any other invalidation that reaches it, a broad one included, replays every page while it is observed.
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

export function useListTransfers() {
  return useInfiniteQuery({
    ...getListTransfersOptions(),
    select: selectTransferHistory,
  });
}

// Never cancels a fetch under way, a refresh held offline included. A list resting at its end asks only when its rows
// change: after a fetch leaving them unchanged, asks again while they are still shown. After a failed page, Retry asks.
export function askForNextTransferHistoryPage(
  queryClient: QueryClient,
  transferHistory: ReturnType<typeof useListTransfers>,
) {
  if (!transferHistory.hasNextPage || transferHistory.isFetchNextPageError)
    return;
  void transferHistory
    .fetchNextPage({ cancelRefetch: false })
    .then((settled) => {
      if (
        settled.data === transferHistory.data &&
        queryClient
          .getQueryCache()
          .find({ queryKey: getListTransfersOptions().queryKey })
          ?.isActive()
      )
        askForNextTransferHistoryPage(queryClient, settled);
    });
}

export function findTransferInHistory(
  queryClient: QueryClient,
  transferId: string,
) {
  return queryClient
    .getQueryData(getListTransfersOptions().queryKey)
    ?.pages.flatMap(({ items }) => items)
    .find((transfer) => transfer.transferId === transferId);
}

export function isTransferHistoryCached(queryClient: QueryClient) {
  return (
    queryClient.getQueryData(getListTransfersOptions().queryKey) !== undefined
  );
}

export function countLoadedTransfersOnDay(
  queryClient: QueryClient,
  date: string,
) {
  const history = queryClient.getQueryData(getListTransfersOptions().queryKey);
  return history
    ? selectTransferHistory(history).transfers.filter(
        ({ malaysianDate }) => malaysianDate === date,
      ).length
    : 0;
}

// Whole pages, the newest always: a refetch asks again for every page kept, one after another.
export function trimTransferHistory(
  queryClient: QueryClient,
  transfersKept = 0,
) {
  queryClient.setQueriesData<InfiniteData<ListTransfersResponse>>(
    { queryKey: transferKeys.historyAll },
    (history) => {
      if (!history) return history;
      let keptPages = 1;
      let keptTransfers = history.pages[0]?.items.length ?? 0;
      while (
        keptPages < history.pages.length &&
        keptTransfers + (history.pages[keptPages]?.items.length ?? 0) <=
          transfersKept
      ) {
        keptTransfers += history.pages[keptPages]?.items.length ?? 0;
        keptPages += 1;
      }
      return {
        pages: history.pages.slice(0, keptPages),
        pageParams: history.pageParams.slice(0, keptPages),
      };
    },
  );
}

// After a transfer: a page fetch already under way would land on pages the new transfer has shifted.
export async function resetTransferHistory(
  queryClient: QueryClient,
  transfersKept = 0,
) {
  await queryClient.cancelQueries({ queryKey: transferKeys.historyAll });
  trimTransferHistory(queryClient, transfersKept);
  // Closed History too: reopened after a transfer, it then shows that transfer at once.
  await queryClient.invalidateQueries({
    queryKey: transferKeys.historyAll,
    refetchType: "all",
  });
}

// Enough to scroll back through on reopening; every one is drawn as History opens.
export const TRANSFERS_KEPT_ON_REOPENING = 200;

export async function patchTransferInHistory(
  queryClient: QueryClient,
  transfer: Transfer,
) {
  await queryClient.cancelQueries({ queryKey: transferKeys.historyAll });
  queryClient.setQueriesData<InfiniteData<ListTransfersResponse>>(
    { queryKey: transferKeys.historyAll },
    (history) => {
      const listedTransfer = history?.pages
        .flatMap(({ items }) => items)
        .find(({ transferId }) => transferId === transfer.transferId);
      if (
        !history ||
        !listedTransfer ||
        listedTransfer.version >= transfer.version
      )
        return history;
      // The bank's day net, kept true until the next reset brings its own figure.
      const parsedAmount = parseWireAmount(transfer.amount);
      const netMoveMinor = parsedAmount
        ? (MONEY_MOVED_SIGN[transfer.funds] -
            MONEY_MOVED_SIGN[listedTransfer.funds]) *
          parsedAmount.minor
        : 0;
      const listedDate = toMalaysianDateKey(listedTransfer.createdAt);
      return {
        ...history,
        pages: history.pages.map((page) => ({
          ...page,
          items: page.items.map((item) =>
            item.transferId === transfer.transferId ? transfer : item,
          ),
          days: page.days.map((day) =>
            day.date === listedDate
              ? {
                  ...day,
                  net: { ...day.net, minor: day.net.minor + netMoveMinor },
                }
              : day,
          ),
        })),
      };
    },
  );
}

// Module-level so its identity holds: TanStack re-runs a new select over every loaded transfer.
function selectTransferHistory(history: InfiniteData<ListTransfersResponse>) {
  const daySummaries: Record<string, ListTransfersResponse["days"][number]> =
    {};
  // A day split across two pages comes with its whole-day summary in both: keep one, never add them.
  for (const page of history.pages)
    for (const day of page.days) daySummaries[day.date] = day;
  const transfers = history.pages.flatMap(({ items }) => items);
  const readableDates = transfers.map(({ createdAt }) =>
    toMalaysianDateKey(createdAt),
  );
  // A row whose time cannot be read keeps its place in the bank's newest-first order, on its neighbour's day.
  let malaysianDate = readableDates.find((date) => date !== null) ?? "";
  return {
    transfers: transfers.map((transfer, index) => {
      malaysianDate = readableDates[index] ?? malaysianDate;
      return { ...transfer, malaysianDate };
    }),
    daySummaries,
  };
}
