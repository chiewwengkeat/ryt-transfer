import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import {
  getListTransfersOptions,
  resetTransferHistory,
  type useListTransfers,
} from "@/domains/transfer/api/list-transfers/list-transfers";
import { toMalaysianDateKey } from "@/shared/lib/dates/dates";

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

  const toggleTransferDay = (date: string, expanded: boolean) => {
    // From the cache, not this render's rows: closing over those would redraw every row on each page.
    const loadedRowCount = queryClient
      .getQueryData(getListTransfersOptions().queryKey)
      ?.pages.flatMap(({ items }) => items)
      .filter(({ createdAt }) => toMalaysianDateKey(createdAt) === date).length;
    setCollapsedDayRowCounts((counts) => ({
      ...counts,
      [date]: expanded ? (loadedRowCount ?? 0) : undefined,
    }));
  };

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
        // Not after a failure, or a failing bank is asked again each time the end shows: the footer's Retry does it.
        // Not while any fetch is under way or waiting offline: fetchNextPage cancels it, a refresh included.
        if (
          transferHistory.hasNextPage &&
          transferHistory.fetchStatus === "idle" &&
          !transferHistory.isFetchNextPageError
        )
          void transferHistory.fetchNextPage();
      }}
      ListFooterComponent={
        <ViewTransferHistoryFooter
          hasNextPage={transferHistory.hasNextPage}
          isFetchingNextPage={transferHistory.isFetchingNextPage}
          isFetchNextPageError={transferHistory.isFetchNextPageError}
          isPaused={transferHistory.isPaused}
          onRetry={() => {
            void transferHistory.fetchNextPage();
          }}
        />
      }
      refreshing={transferHistory.isRefetching}
      onRefresh={() => {
        void resetTransferHistory(queryClient).then(() => {
          listRef.current?.scrollToTop();
        });
      }}
      // A refresh's new transfers land above the first row; holding that row in place would hide them.
      maintainVisibleContentPosition={{ disabled: true }}
    />
  );
}
