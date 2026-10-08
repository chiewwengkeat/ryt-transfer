import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import { http, HttpResponse } from "msw";
import { createElement, type ReactNode } from "react";

import {
  getTransferOptions,
  useGetTransfer,
} from "@/domains/transfer/api/get-transfer/get-transfer";
import {
  TransferDirection,
  TransferFunds,
  TransferStatus,
  type Transfer,
} from "@/domains/transfer/api/get-transfer/get-transfer.type";
import { RecipientIdType } from "@/domains/transfer/api/lookup-recipient/lookup-recipient.type";
import { mswServer } from "@/test/msw-server";

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
    // No gc timers: a cache entry's 5-minute timer holds a single-file run open.
    const queryClient = new QueryClient({
      defaultOptions: { queries: { gcTime: Infinity } },
    });
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
