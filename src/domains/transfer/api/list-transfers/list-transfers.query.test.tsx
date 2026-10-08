import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";

import {
  TransferFunds,
  TransferStatus,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import { API_BASE_URL } from "@/shared/config/config";
import { observedRecords } from "@/test/harness/recording-sink";
import { mswServer, sentRequests } from "@/test/msw-server";

import {
  askForNextTransferHistoryPage,
  getListTransfersOptions,
  patchTransferInHistory,
  resetTransferHistory,
  useListTransfers,
} from "./list-transfers";
import type { ListTransfersResponse } from "./list-transfers.type";

// The query run against the Jest bank, its cache writes included; list-transfers.test.ts seeds the cache by hand. A
// new suite is named for what fills its cache.

// No gc timer: an unobserved query's 5-minute timer holds a single-file run open.
const createTestQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });

function renderTransferHistory(queryClient: QueryClient) {
  return renderHook(() => useListTransfers(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

// Paged as the screen pages: a fetch given `pages` keeps it, and every later refetch would replay that many.
async function loadBothPages(queryClient: QueryClient) {
  const { result } = await renderTransferHistory(queryClient);
  await waitFor(() => {
    expect(result.current.data?.transfers).toHaveLength(30);
  });
  const firstPage = result.current.data;
  await act(() => result.current.fetchNextPage());
  await waitFor(() => {
    expect(result.current.data?.transfers).toHaveLength(45);
  });
  sentRequests.splice(0);
  const cachedPages = queryClient.getQueryData(
    getListTransfersOptions().queryKey,
  );
  if (!cachedPages) throw new Error("History did not load.");
  return { firstPage, bothPages: result.current.data, cachedPages };
}

async function askForNextPageWhileARefreshWaitsOffline(
  queryClient: QueryClient,
) {
  const { result, unmount } = await renderTransferHistory(queryClient);
  await waitFor(() => {
    expect(result.current.data?.transfers).toHaveLength(30);
  });
  sentRequests.splice(0);
  onlineManager.setOnline(false);
  void resetTransferHistory(queryClient);
  await waitFor(() => {
    expect(result.current.isPaused).toBe(true);
  });
  askForNextTransferHistoryPage(queryClient, result.current);
  return { result, unmount };
}

it("asks for 30 transfers at a time, and for each later page by the cursor the bank last returned", async () => {
  const history = await createTestQueryClient().fetchInfiniteQuery({
    ...getListTransfersOptions(),
    pages: 2,
  });

  const [firstQuery, secondQuery] = sentRequests.map(
    ({ url }) => new URL(url).searchParams,
  );
  expect(firstQuery?.get("limit")).toBe("30");
  expect(firstQuery?.has("cursor")).toBe(false);
  expect(secondQuery?.get("limit")).toBe("30");
  expect(secondQuery?.get("cursor")).toBe(history.pages[0]?.nextCursor);
  expect(history.pages.map(({ items }) => items.length)).toEqual([30, 15]);
});

it("keeps each page exactly as the bank sent it, amounts still on the wire", async () => {
  const history = await createTestQueryClient().fetchInfiniteQuery(
    getListTransfersOptions(),
  );
  const response = await fetch(`${API_BASE_URL}/transfers?limit=30`);

  expect(history.pages).toEqual([await response.json()]);
});

it("reports a page's unreadable amounts, a row's and a day's alike, as one unreadable_amount at the history boundary", async () => {
  const response = await fetch(`${API_BASE_URL}/transfers?limit=30`);
  const bankPage = (await response.json()) as ListTransfersResponse;
  mswServer.use(
    http.get(`${API_BASE_URL}/transfers`, () =>
      HttpResponse.json({
        ...bankPage,
        items: bankPage.items.map((transfer, index) =>
          index === 0
            ? { ...transfer, amount: { ...transfer.amount, minor: 50.5 } }
            : transfer,
        ),
        days: bankPage.days.map((day, index) =>
          index === 0 ? { ...day, net: { ...day.net, currency: "SGD" } } : day,
        ),
      }),
    ),
  );

  await createTestQueryClient().fetchInfiniteQuery(getListTransfersOptions());

  expect(
    observedRecords.filter(({ name }) => name === "unreadable_amount"),
  ).toEqual([
    {
      type: "event",
      name: "unreadable_amount",
      properties: { boundary: "transfer_history", count: 2 },
    },
  ]);
});

it("keeps every transfer and day summary it already had when the next page lands", async () => {
  const { firstPage, bothPages } = await loadBothPages(createTestQueryClient());

  expect(bothPages?.transfers).toHaveLength(45);
  bothPages?.transfers.slice(0, 30).forEach((transfer, index) => {
    expect(transfer).toBe(firstPage?.transfers[index]);
  });
  expect(bothPages?.daySummaries["2026-10-06"]).toBe(
    firstPage?.daySummaries["2026-10-06"],
  );
  expect(bothPages?.daySummaries["2026-09-26"]).toBe(
    firstPage?.daySummaries["2026-09-26"],
  );
});

it("files each transfer under its Malaysian date, beside that whole day's summary", async () => {
  const { bothPages } = await loadBothPages(createTestQueryClient());

  expect(
    bothPages?.transfers.filter(
      ({ malaysianDate }) => malaysianDate === "2026-09-26",
    ),
  ).toHaveLength(5);
  expect(bothPages?.daySummaries["2026-09-26"]).toEqual({
    date: "2026-09-26",
    count: 5,
    net: { minor: -80173, currency: "MYR" },
  });
  bothPages?.transfers.forEach(({ createdAt, malaysianDate }) => {
    expect(malaysianDate).toBe(createdAt.slice(0, 10));
  });
});

it("asks for the next page once a refresh held offline lands unchanged, never cancelling the refresh", async () => {
  const queryClient = createTestQueryClient();
  const { result } = await askForNextPageWhileARefreshWaitsOffline(queryClient);
  const secondPageCursor = queryClient.getQueryData(
    getListTransfersOptions().queryKey,
  )?.pages[0]?.nextCursor;

  onlineManager.setOnline(true);

  await waitFor(() => {
    expect(result.current.data?.transfers).toHaveLength(45);
  });
  expect(
    sentRequests.map(({ url }) => new URL(url).searchParams.get("cursor")),
  ).toEqual([null, secondPageCursor]);
});

it("asks for no page once the list it was asked for is gone", async () => {
  const queryClient = createTestQueryClient();
  const { unmount } =
    await askForNextPageWhileARefreshWaitsOffline(queryClient);

  // Mounted past the list, as the app's provider is: an unmounted client resumes nothing once back online.
  queryClient.mount();
  await unmount();
  onlineManager.setOnline(true);
  await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
  queryClient.unmount();

  expect(sentRequests).toEqual([]);
});

it("drops a page still loading when it resets, so the page never lands", async () => {
  const queryClient = createTestQueryClient();
  const { result } = await renderTransferHistory(queryClient);
  await waitFor(() => {
    expect(result.current.data?.transfers).toHaveLength(30);
  });

  await act(async () => {
    void result.current.fetchNextPage();
    await resetTransferHistory(queryClient);
  });
  await act(() => new Promise((resolve) => setTimeout(resolve, 50)));

  expect(result.current.data?.transfers).toHaveLength(30);
  expect(result.current.hasNextPage).toBe(true);
  expect(result.current.isFetchNextPageError).toBe(false);
});

it("patches a transfer with its newer version and moves its day's net by the money that moved", async () => {
  const queryClient = createTestQueryClient();
  const { cachedPages: before } = await loadBothPages(queryClient);
  const [listed, untouched] = before.pages[0]?.items ?? [];
  if (!listed || !untouched) throw new Error("The bank listed no transfers.");
  const refunded = {
    ...listed,
    version: listed.version + 1,
    status: TransferStatus.Unsuccessful,
    funds: TransferFunds.Refunded,
  };

  await act(() => patchTransferInHistory(queryClient, refunded));

  const after = queryClient.getQueryData(getListTransfersOptions().queryKey);
  expect(after?.pages[0]?.items[0]).toEqual(refunded);
  expect(after?.pages[0]?.items[1]).toBe(untouched);
  const dayOf = (history: typeof before | undefined) =>
    history?.pages[0]?.days.find(({ date }) => date === "2026-10-06");
  expect(dayOf(after)?.net.minor).toBe(
    (dayOf(before)?.net.minor ?? NaN) + listed.amount.minor,
  );
  expect(dayOf(after)?.count).toBe(dayOf(before)?.count);
  expect(after?.pages[0]?.days[1]).toBe(before.pages[0]?.days[1]);
});

it("moves a split day's net in both pages that carry it", async () => {
  const queryClient = createTestQueryClient();
  const { cachedPages: before } = await loadBothPages(queryClient);
  const splitDayTransfer = before.pages[1]?.items[0];
  if (splitDayTransfer?.createdAt.slice(0, 10) !== "2026-09-26")
    throw new Error("The bank's page 2 no longer opens on the split day.");

  await act(() =>
    patchTransferInHistory(queryClient, {
      ...splitDayTransfer,
      version: splitDayTransfer.version + 1,
      funds: TransferFunds.NotDebited,
    }),
  );

  const [firstPageNet, secondPageNet] =
    queryClient
      .getQueryData(getListTransfersOptions().queryKey)
      ?.pages.map(
        ({ days }) => days.find(({ date }) => date === "2026-09-26")?.net.minor,
      ) ?? [];
  expect(firstPageNet).toBe(-80173 + splitDayTransfer.amount.minor);
  expect(secondPageNet).toBe(firstPageNet);
});

it("ignores a copy of the same version as the one listed", async () => {
  const queryClient = createTestQueryClient();
  const { cachedPages: before } = await loadBothPages(queryClient);
  const listed = before.pages[0]?.items[0];
  if (!listed) throw new Error("The bank listed no transfers.");

  await act(() =>
    patchTransferInHistory(queryClient, {
      ...listed,
      funds: TransferFunds.Refunded,
    }),
  );

  expect(queryClient.getQueryData(getListTransfersOptions().queryKey)).toBe(
    before,
  );
});
