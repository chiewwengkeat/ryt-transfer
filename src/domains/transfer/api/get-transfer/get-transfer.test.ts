import { QueryClientProvider, type InfiniteData } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";
import { createElement, type ReactNode } from "react";

import { RecipientIdType } from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import { mswServer, startTestTransfer } from "@/test/mock-bank/mock-bank";
import { createQueryClientWithoutGcTimers } from "@/test/render/drive-app";

import type { ListTransfersResponse } from "@/domains/transfer/api/list-transfers/list-transfers.type";
import { transferKeys } from "@/domains/transfer/api/transfer.keys";

import { getTransferOptions, useGetTransfer } from "./get-transfer";
import {
  TransferDirection,
  TransferFunds,
  TransferStatus,
  type Transfer,
} from "./get-transfer.type";

it.each([
  { relation: "the same version as", versionOfNext: 3 },
  { relation: "an older version than", versionOfNext: 2 },
])(
  "shows the transfer asked for when moving to one cached at $relation the transfer before",
  async ({ versionOfNext }) => {
    const transfersById: Record<string, Transfer> = {
      trf_1: transferAt("trf_1", 3, TransferStatus.Completed),
      trf_2: transferAt("trf_2", versionOfNext, TransferStatus.Unsuccessful),
    };
    mswServer.use(
      http.get("*/transfers/:transferId", ({ params }) =>
        HttpResponse.json({
          transfer: transfersById[String(params.transferId)],
        }),
      ),
    );
    const queryClient = createQueryClientWithoutGcTimers();
    await queryClient.fetchQuery(getTransferOptions("trf_2"));
    const { result, rerender } = await renderHook(
      ({ transferId }: { transferId: string }) => useGetTransfer(transferId),
      {
        initialProps: { transferId: "trf_1" },
        wrapper: ({ children }: { children: ReactNode }) =>
          createElement(QueryClientProvider, { client: queryClient }, children),
      },
    );
    await waitFor(() => {
      expect(result.current.data?.transferId).toBe("trf_1");
    });

    await rerender({ transferId: "trf_2" });

    await waitFor(() => {
      expect(result.current.data).toMatchObject({
        transferId: "trf_2",
        status: TransferStatus.Unsuccessful,
      });
    });
  },
);

it("brings history's older copy of a transfer up to date when the transfer is read", async () => {
  const {
    created: { transfer },
  } = await startTestTransfer(10_000);
  const queryClient = createQueryClientWithoutGcTimers();
  queryClient.setQueryData<InfiniteData<ListTransfersResponse>>(
    transferKeys.history(),
    {
      pages: [
        {
          ...EMPTY_HISTORY_PAGE,
          items: [{ ...transfer, version: transfer.version - 1 }],
        },
      ],
      pageParams: [null],
    },
  );

  const read = await queryClient.fetchQuery(
    getTransferOptions(transfer.transferId),
  );

  expect(
    queryClient.getQueryData<InfiniteData<ListTransfersResponse>>(
      transferKeys.history(),
    )?.pages[0]?.items,
  ).toEqual([read]);
});

it("leaves a history load running when history holds no copy of the transfer read", async () => {
  const {
    created: { transfer },
  } = await startTestTransfer(10_000);
  const queryClient = createQueryClientWithoutGcTimers();
  let finishHistoryLoad: (page: ListTransfersResponse) => void = () =>
    undefined;
  const historyLoad = queryClient.fetchInfiniteQuery({
    queryKey: transferKeys.history(),
    queryFn: () =>
      new Promise<ListTransfersResponse>((resolve) => {
        finishHistoryLoad = resolve;
      }),
    initialPageParam: null,
  });

  await queryClient.fetchQuery(getTransferOptions(transfer.transferId));
  finishHistoryLoad(EMPTY_HISTORY_PAGE);

  await expect(historyLoad).resolves.toEqual({
    pages: [EMPTY_HISTORY_PAGE],
    pageParams: [null],
  });
});

const transferAt = (
  transferId: string,
  version: number,
  status: TransferStatus,
): Transfer => ({
  transferId,
  version,
  direction: TransferDirection.Out,
  status,
  funds:
    status === TransferStatus.Completed
      ? TransferFunds.Debited
      : TransferFunds.NotDebited,
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

const EMPTY_HISTORY_PAGE: ListTransfersResponse = {
  items: [],
  nextCursor: null,
  days: [],
};
