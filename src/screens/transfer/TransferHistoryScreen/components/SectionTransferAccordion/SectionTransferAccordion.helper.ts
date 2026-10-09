import type { ListTransfersResponse } from "@/domains/transfer/api/list-transfers/list-transfers.type";

// One object per summary and flag: a header's cell redraws only when its day's summary or open state changes.
export function reuseTransferDayHeaderRow(
  summary: ListTransfersResponse["days"][number],
  expanded: boolean,
) {
  const dayHeaderRows = expanded
    ? expandedDayHeaderRows
    : collapsedDayHeaderRows;
  const dayHeaderRow = dayHeaderRows.get(summary) ?? { summary, expanded };
  dayHeaderRows.set(summary, dayHeaderRow);
  return dayHeaderRow;
}

const expandedDayHeaderRows = new WeakMap<
  ListTransfersResponse["days"][number],
  { summary: ListTransfersResponse["days"][number]; expanded: boolean }
>();
const collapsedDayHeaderRows: typeof expandedDayHeaderRows = new WeakMap();
