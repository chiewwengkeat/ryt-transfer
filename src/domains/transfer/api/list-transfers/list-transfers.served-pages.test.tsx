import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { sentRequests } from "@/test/mock-bank/msw-server";
import { createQueryClientWithoutGcTimers } from "@/test/render/query-client-without-gc-timers";
import {
  buildHistoryTransfer,
  serveTransferHistoryPages,
} from "@/test/fixtures/transfer-history-pages";

import {
  askForNextTransferHistoryPage,
  useListTransfers,
} from "./list-transfers";

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
