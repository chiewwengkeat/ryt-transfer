import { QueryClient, type InfiniteData } from "@tanstack/react-query";

import {
  TransferDirection,
  TransferFunds,
  TransferStatus,
  type Transfer,
} from "../get-transfer/get-transfer.type";
import { RecipientIdType } from "../lookup-recipient/lookup-recipient.type";
import { transferKeys } from "../transfer.keys";
import { patchTransferInHistory, resetTransferHistory } from "./list-transfers";
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
  const queryClient = new QueryClient();
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
