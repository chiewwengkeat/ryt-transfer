import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { TransferStatus } from "@/domains/transfer/api/get-transfer/get-transfer.type";
import {
  askForNextTransferHistoryPage,
  findTransferInHistory,
  getListTransfersOptions,
  patchTransferInHistory,
  resetTransferHistory,
  selectTransferHistory,
  type useListTransfers,
} from "@/domains/transfer/api/list-transfers/list-transfers";
import { useRenderMeasurement } from "@/shared/observability/render-trace";

import HeaderTransferDay from "./components/HeaderTransferDay/HeaderTransferDay";
import ItemTransfer from "./components/ItemTransfer/ItemTransfer";
import ViewTransferHistoryFooter from "./components/ViewTransferHistoryFooter/ViewTransferHistoryFooter";
import { useMalaysianToday } from "./hooks/use-malaysian-today";
import { getTransferDayHeaderRow } from "./SectionTransferAccordion.helper";

interface Props {
  transferHistory: ReturnType<typeof useListTransfers>;
}
export default function SectionTransferAccordion({ transferHistory }: Props) {
  const queryClient = useQueryClient();
  const malaysianToday = useMalaysianToday();
  // A collapsed day's loaded row count at collapse: more rows landing in it open it again.
  const [collapsedDayRowCounts, setCollapsedDayRowCounts] = useState<
    Record<string, number | undefined>
  >({});

  const transfers = transferHistory.data?.transfers ?? [];
  const transfersByDate = new Map<string, typeof transfers>();
  for (const transfer of transfers) {
    const dayTransfers = transfersByDate.get(transfer.malaysianDate);
    if (dayTransfers) dayTransfers.push(transfer);
    else transfersByDate.set(transfer.malaysianDate, [transfer]);
  }
  const dataItems = [...transfersByDate].flatMap(([date, dayTransfers]) => {
    const collapsedAt = collapsedDayRowCounts[date];
    const expanded =
      collapsedAt === undefined || dayTransfers.length > collapsedAt;
    const summary = transferHistory.data?.daySummaries[date];
    const header = summary ? [getTransferDayHeaderRow(summary, expanded)] : [];
    return expanded ? [...header, ...dayTransfers] : header;
  });
  const listRef = useRef<FlashListRef<(typeof dataItems)[number]>>(null);

  // From the cache, not this render's rows: closing over those would redraw every row on each page.
  const countLoadedTransfersOn = (date: string) => {
    const history = queryClient.getQueryData(
      getListTransfersOptions().queryKey,
    );
    return history
      ? selectTransferHistory(history).transfers.filter(
          ({ malaysianDate }) => malaysianDate === date,
        ).length
      : 0;
  };

  const toggleTransferDay = (date: string, expanded: boolean) => {
    setCollapsedDayRowCounts((counts) => ({
      ...counts,
      [date]: expanded ? countLoadedTransfersOn(date) : undefined,
    }));
  };

  useRenderMeasurement(
    {
      pageAppend: () => transferHistory.fetchNextPage(),
      pullToRefreshWithNothingNew: async () => {
        await resetTransferHistory(queryClient);
        listRef.current?.scrollToTop();
      },
      statusChange: async () => {
        const listed = findTransferInHistory(
          queryClient,
          transfers[0]?.transferId ?? "",
        );
        if (listed)
          await patchTransferInHistory(queryClient, {
            ...listed,
            version: listed.version + 1,
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
            const newest = firstPage?.items[0];
            if (!history || !firstPage || !newest) return history;
            return {
              pages: [
                {
                  ...firstPage,
                  items: [
                    { ...newest, transferId: `${newest.transferId}-new` },
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

  return (
    <FlashList
      ref={listRef}
      data={dataItems}
      extraData={malaysianToday}
      keyExtractor={(item) =>
        "transferId" in item ? item.transferId : `h-${item.summary.date}`
      }
      getItemType={(item) => ("transferId" in item ? "transfer" : "header")}
      renderItem={({ item, extraData }) =>
        "transferId" in item ? (
          <ItemTransfer transfer={item} />
        ) : (
          <HeaderTransferDay
            summary={item.summary}
            expanded={item.expanded}
            today={extraData as Date}
            onToggle={() => {
              toggleTransferDay(item.summary.date, item.expanded);
            }}
          />
        )
      }
      onEndReachedThreshold={1}
      onEndReached={() => {
        askForNextTransferHistoryPage(queryClient, transferHistory);
      }}
      ListFooterComponent={
        <ViewTransferHistoryFooter
          hasNextPage={transferHistory.hasNextPage}
          isFetchingNextPage={transferHistory.isFetchingNextPage}
          isFetchNextPageError={transferHistory.isFetchNextPageError}
          onRetry={() => {
            void transferHistory.fetchNextPage();
          }}
        />
      }
      refreshing={transferHistory.isRefetching}
      onRefresh={() => {
        // A day reopened by a later page's rows would close again once the refresh trims them away.
        setCollapsedDayRowCounts((counts) =>
          Object.fromEntries(
            Object.entries(counts).filter(
              ([date, collapsedAt]) =>
                collapsedAt !== undefined &&
                countLoadedTransfersOn(date) <= collapsedAt,
            ),
          ),
        );
        void resetTransferHistory(queryClient).then(() => {
          listRef.current?.scrollToTop();
        });
      }}
      // A refresh's new transfers land above the first row; holding that row in place would hide them.
      maintainVisibleContentPosition={{ disabled: true }}
    />
  );
}
