import { TransferStatus } from "@/domains/transfer/api/get-transfer/get-transfer.type";
import {
  findTransferInHistory,
  getListTransfersOptions,
  patchTransferInHistory,
  resetTransferHistory,
  type useListTransfers,
} from "@/domains/transfer/api/list-transfers/list-transfers";
import { useRenderMeasurement } from "@/shared/observability/render-trace/render-trace";
import type { FlashListRef } from "@shopify/flash-list";
import { useQueryClient } from "@tanstack/react-query";
import type { RefObject } from "react";

// ⛔ Keep the literal comparison, never a shared constant or config: Metro folds only this form, which removes the operations below from demo and production builds.
export const useTransferHistoryRenderMeasurement =
  process.env.EXPO_PUBLIC_APP_VARIANT === "development"
    ? useTransferHistoryRenderMeasurementInDevelopment
    : () => {};

function useTransferHistoryRenderMeasurementInDevelopment(
  transferHistory: ReturnType<typeof useListTransfers>,
  listRef: RefObject<Pick<
    FlashListRef<unknown>,
    "scrollToTop" | "scrollToEnd"
  > | null>,
  toggleTransferDay: (date: string, wasExpanded: boolean) => void,
) {
  const queryClient = useQueryClient();
  const transfers = transferHistory.data?.transfers ?? [];

  useRenderMeasurement(
    {
      pageAppend: () => transferHistory.fetchNextPage(),
      pullToRefreshWithNothingNew: async () => {
        await resetTransferHistory(queryClient);
        listRef.current?.scrollToTop();
      },
      statusChange: async () => {
        const newestTransfer = findTransferInHistory(
          queryClient,
          transfers[0]?.transferId ?? "",
        );
        if (newestTransfer)
          await patchTransferInHistory(queryClient, {
            ...newestTransfer,
            version: newestTransfer.version + 1,
            status: TransferStatus.Processing,
          });
      },
      dayCollapse: () => {
        toggleTransferDay(transfers[0]?.malaysianDate ?? "", true);
      },
      dayExpand: () => {
        toggleTransferDay(transfers[0]?.malaysianDate ?? "", false);
      },
      // As a reset leaves the cache once a transfer lands: one page, the new transfer first, its day counting it.
      newTransferAtTop: () => {
        queryClient.setQueryData(
          getListTransfersOptions().queryKey,
          (history) => {
            const firstPage = history?.pages[0];
            const newestTransfer = firstPage?.items[0];
            if (!history || !firstPage || !newestTransfer) return history;
            return {
              pages: [
                {
                  ...firstPage,
                  items: [
                    {
                      ...newestTransfer,
                      transferId: `${newestTransfer.transferId}-new`,
                    },
                    ...firstPage.items.slice(0, 29),
                  ],
                  days: firstPage.days.map((day) =>
                    day.date === transfers[0]?.malaysianDate
                      ? { ...day, count: day.count + 1 }
                      : day,
                  ),
                },
              ],
              pageParams: history.pageParams.slice(0, 1),
            };
          },
        );
      },
      pageAppendAtEnd: async () => {
        listRef.current?.scrollToEnd({ animated: false });
        await transferHistory.fetchNextPage();
      },
    },
    () => ({
      pagesLoaded:
        queryClient.getQueryData(getListTransfersOptions().queryKey)?.pages
          .length ?? 0,
    }),
  );
}
