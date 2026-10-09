import { type InfiniteData, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { sentRequests } from "@/test/mock-bank/mock-bank";
import { createQueryClientWithoutGcTimers } from "@/test/render/drive-app";
import {
  buildHistoryTransfer,
  serveTransferHistoryPages,
} from "@/test/fixtures/transfer-responses";

import {
  TransferDirection,
  TransferFunds,
  TransferStatus,
  type Transfer,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import { RecipientIdType } from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import { transferKeys } from "@/domains/transfer/api/transfer.keys";
import {
  askForNextTransferHistoryPage,
  countLoadedTransfersOnDay,
  isTransferHistoryCached,
  patchTransferInHistory,
  resetTransferHistory,
  trimTransferHistoryToFirstPage,
  useListTransfers,
} from "./list-transfers";
import type { ListTransfersResponse } from "./list-transfers.type";

const transferAt = (version: number, status: TransferStatus): Transfer => ({
  transferId: "trf_1",
  version,
  direction: TransferDirection.Out,
  status,
  funds: TransferFunds.Debited,
  counterparty: {
    registeredName: "TAN WEI MING",
    idType: RecipientIdType.Mobile,
    idValueMasked: "•••• 6789",
    bankName: "Maybank",
  },
  amount: { minor: 10_000, currency: "MYR" },
  createdAt: "2026-10-07T09:30:00+08:00",
  updatedAt: "2026-10-07T09:30:05+08:00",
});

function historyHolding(...pages: Transfer[][]) {
  const queryClient = createQueryClientWithoutGcTimers();
  queryClient.setQueryData<InfiniteData<ListTransfersResponse>>(
    transferKeys.history(),
    {
      pages: pages.map((items) => ({ items, nextCursor: null, days: [] })),
      pageParams: pages.map((_, index) => index),
    },
  );
  return {
    queryClient,
    read: () =>
      queryClient.getQueryData<InfiniteData<ListTransfersResponse>>(
        transferKeys.history(),
      ),
  };
}

it("patches a transfer in history only with a newer copy of it", async () => {
  const history = historyHolding([transferAt(2, TransferStatus.Processing)]);

  await patchTransferInHistory(
    history.queryClient,
    transferAt(1, TransferStatus.Unsuccessful),
  );
  expect(history.read()?.pages[0]?.items[0]?.status).toBe(
    TransferStatus.Processing,
  );

  await patchTransferInHistory(
    history.queryClient,
    transferAt(3, TransferStatus.Completed),
  );
  expect(history.read()?.pages[0]?.items[0]?.status).toBe(
    TransferStatus.Completed,
  );
});

it("keeps only the newest page of history after a transfer", async () => {
  const history = historyHolding(
    [transferAt(1, TransferStatus.Completed)],
    [transferAt(1, TransferStatus.Completed)],
  );

  await resetTransferHistory(history.queryClient);

  expect(history.read()?.pages).toHaveLength(1);
  expect(history.read()?.pageParams).toEqual([0]);
});

it("keeps only the newest page of history when History closes, writing nothing to a cold cache", () => {
  const history = historyHolding(
    [transferAt(1, TransferStatus.Completed)],
    [transferAt(1, TransferStatus.Completed)],
    [transferAt(1, TransferStatus.Completed)],
  );
  const coldCache = createQueryClientWithoutGcTimers();

  trimTransferHistoryToFirstPage(history.queryClient);
  trimTransferHistoryToFirstPage(coldCache);

  expect(history.read()?.pages).toHaveLength(1);
  expect(history.read()?.pageParams).toEqual([0]);
  expect(isTransferHistoryCached(coldCache)).toBe(false);
});

it("finds history cached only once a page of it has landed", () => {
  const coldCache = createQueryClientWithoutGcTimers();
  coldCache
    .getQueryCache()
    .build(coldCache, { queryKey: transferKeys.history() });

  expect(isTransferHistoryCached(coldCache)).toBe(false);
  expect(
    isTransferHistoryCached(
      historyHolding([transferAt(1, TransferStatus.Completed)]).queryClient,
    ),
  ).toBe(true);
});

it("counts a Malaysian day's loaded transfers across pages, one whose time cannot be read on its neighbour's day", () => {
  const transferSentAt = (transferId: string, createdAt: string) => ({
    ...transferAt(1, TransferStatus.Completed),
    transferId,
    createdAt,
  });
  const history = historyHolding(
    [
      transferSentAt("trf_1", "2026-10-07T09:30:00+08:00"),
      transferSentAt("trf_2", "2026-10-06T23:30:00Z"),
    ],
    [
      transferSentAt("trf_3", "not a time"),
      transferSentAt("trf_4", "2026-10-06T09:30:00+08:00"),
    ],
  );

  expect(countLoadedTransfersOnDay(history.queryClient, "2026-10-07")).toBe(3);
  expect(countLoadedTransfersOnDay(history.queryClient, "2026-10-06")).toBe(1);
  expect(
    countLoadedTransfersOnDay(createQueryClientWithoutGcTimers(), "2026-10-07"),
  ).toBe(0);
});

it("asks for the next page alone when the list asks once at rest", async () => {
  serveTransferHistoryPages([
    [buildHistoryTransfer()],
    [
      buildHistoryTransfer({
        registeredName: "Tan Mei Ling",
        createdAt: "2026-10-04T09:00:00+08:00",
      }),
    ],
    [
      buildHistoryTransfer({
        registeredName: "Lim Wei Jie",
        createdAt: "2026-10-03T13:05:00+08:00",
      }),
    ],
  ]);
  const queryClient = createQueryClientWithoutGcTimers();
  const { result } = await renderHook(() => useListTransfers(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
  await waitFor(() => {
    expect(result.current.data?.transfers).toHaveLength(1);
  });
  sentRequests.splice(0);

  askForNextTransferHistoryPage(queryClient, result.current);

  await waitFor(() => {
    expect(result.current.data?.transfers.length).toBeGreaterThan(1);
  });
  await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
  expect(
    sentRequests.map(({ url }) => new URL(url).searchParams.get("cursor")),
  ).toEqual(["page-2"]);
});
