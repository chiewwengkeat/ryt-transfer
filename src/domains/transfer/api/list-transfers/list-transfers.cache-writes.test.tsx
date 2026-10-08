import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

import {
  TransferFunds,
  TransferStatus,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import { sentRequests } from "@/test/msw-server";

import {
  getListTransfersOptions,
  patchTransferInHistory,
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

// Paged as the screen pages: a fetch given `pages` keeps it, and every later refetch would replay that many.
async function loadBothPages(queryClient: QueryClient) {
  const { result } = await renderTransferHistory(queryClient);
  await waitFor(() => {
    expect(result.current.data?.transfers).toHaveLength(30);
  });
  await act(() => result.current.fetchNextPage());
  await waitFor(() => {
    expect(result.current.data?.transfers).toHaveLength(45);
  });
  sentRequests.splice(0);
  const history = queryClient.getQueryData(getListTransfersOptions().queryKey);
  if (!history) throw new Error("History did not load.");
  return history;
}

it("resets to the newest page alone, fetched again with one request", async () => {
  const queryClient = createTestQueryClient();
  await loadBothPages(queryClient);

  await act(() => resetTransferHistory(queryClient));

  expect(
    sentRequests.map(({ url }) => new URL(url).searchParams.get("cursor")),
  ).toEqual([null]);
  expect(
    queryClient
      .getQueryData(getListTransfersOptions().queryKey)
      ?.pages.map(({ items }) => items.length),
  ).toEqual([30]);
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
  const before = await loadBothPages(queryClient);
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
  const before = await loadBothPages(queryClient);
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

it("ignores a copy that is not newer than the one listed", async () => {
  const queryClient = createTestQueryClient();
  const before = await loadBothPages(queryClient);
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
