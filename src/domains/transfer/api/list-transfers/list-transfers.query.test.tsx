import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { API_BASE_URL } from "@/shared/config/config";
import { sentRequests } from "@/test/msw-server";

import {
  askForNextTransferHistoryPage,
  getListTransfersOptions,
  resetTransferHistory,
  useListTransfers,
} from "./list-transfers";

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

async function renderTransferHistoryWithBothPages() {
  const { result } = await renderTransferHistory(createTestQueryClient());
  await waitFor(() => {
    expect(result.current.data?.transfers).toHaveLength(30);
  });
  const firstPage = result.current.data;
  await act(() => result.current.fetchNextPage());
  await waitFor(() => {
    expect(result.current.data?.transfers).toHaveLength(45);
  });
  return { firstPage, bothPages: result.current.data };
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

it("keeps every transfer and day summary it already had when the next page lands", async () => {
  const { firstPage, bothPages } = await renderTransferHistoryWithBothPages();

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

it("asks for the next page once a refresh held offline lands unchanged, never cancelling the refresh", async () => {
  const queryClient = createTestQueryClient();
  const { result } = await renderTransferHistory(queryClient);
  await waitFor(() => {
    expect(result.current.data?.transfers).toHaveLength(30);
  });
  const secondPageCursor = queryClient.getQueryData(
    getListTransfersOptions().queryKey,
  )?.pages[0]?.nextCursor;
  sentRequests.splice(0);
  onlineManager.setOnline(false);
  void resetTransferHistory(queryClient);
  await waitFor(() => {
    expect(result.current.isPaused).toBe(true);
  });

  askForNextTransferHistoryPage(queryClient, result.current);
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

  // Mounted past the list, as the app's provider is: an unmounted client resumes nothing once back online.
  queryClient.mount();
  await unmount();
  onlineManager.setOnline(true);
  await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
  queryClient.unmount();

  expect(sentRequests).toEqual([]);
});

it("files each transfer under its Malaysian date, beside that whole day's summary", async () => {
  const { bothPages } = await renderTransferHistoryWithBothPages();

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
