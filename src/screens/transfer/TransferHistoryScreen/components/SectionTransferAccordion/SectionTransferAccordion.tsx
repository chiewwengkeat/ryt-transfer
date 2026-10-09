import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { StyleSheet } from "react-native";

import {
  askForNextTransferHistoryPage,
  countLoadedTransfersOnDay,
  resetTransferHistory,
  type useListTransfers,
} from "@/domains/transfer/api/list-transfers/list-transfers";
import { spacing } from "@/shared/theme/theme";

import HeaderTransferDay from "./components/HeaderTransferDay/HeaderTransferDay";
import ItemTransfer from "./components/ItemTransfer/ItemTransfer";
import ViewTransferHistoryFooter from "./components/ViewTransferHistoryFooter/ViewTransferHistoryFooter";
import { useMalaysianToday } from "./hooks/use-malaysian-today";
import { useTransferHistoryRenderMeasurement } from "./hooks/use-transfer-history-render-measurement";
import { reuseTransferDayHeaderRow } from "./SectionTransferAccordion.helper";

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
    const header = summary
      ? [reuseTransferDayHeaderRow(summary, expanded)]
      : [];
    return expanded ? [...header, ...dayTransfers] : header;
  });
  const listRef = useRef<FlashListRef<(typeof dataItems)[number]>>(null);

  // Counted from the cache, not this render's rows: closing over those would redraw every row on each page.
  const toggleTransferDay = (date: string, wasExpanded: boolean) => {
    setCollapsedDayRowCounts((counts) => ({
      ...counts,
      [date]: wasExpanded
        ? countLoadedTransfersOnDay(queryClient, date)
        : undefined,
    }));
  };

  useTransferHistoryRenderMeasurement(
    transferHistory,
    listRef,
    toggleTransferDay,
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
          fetchNextPageFailure={
            transferHistory.isFetchNextPageError ? transferHistory.error : null
          }
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
                countLoadedTransfersOnDay(queryClient, date) <= collapsedAt,
            ),
          ),
        );
        void resetTransferHistory(queryClient).then(() => {
          listRef.current?.scrollToTop();
        });
      }}
      // A refresh's new transfers land above the first row; holding that row in place would hide them.
      maintainVisibleContentPosition={{ disabled: true }}
      contentContainerStyle={styles.main}
    />
  );
}

const styles = StyleSheet.create({
  main: {
    marginHorizontal: spacing.md,
  },
});
