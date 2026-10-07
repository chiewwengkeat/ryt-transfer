import type { ListTransfersResponse } from "@/domains/transfer/api/list-transfers/list-transfers.type";

const expandedDayHeaderRows = new WeakMap<
  DaySummary,
  { summary: DaySummary; expanded: boolean }
>();
const collapsedDayHeaderRows = new WeakMap<
  DaySummary,
  { summary: DaySummary; expanded: boolean }
>();

// One object per summary and flag: a header's cell redraws only when its day's summary or open state changes.
export function getTransferDayHeaderRow(
  summary: DaySummary,
  expanded: boolean,
) {
  const dayHeaderRows = expanded
    ? expandedDayHeaderRows
    : collapsedDayHeaderRows;
  const dayHeaderRow = dayHeaderRows.get(summary) ?? { summary, expanded };
  dayHeaderRows.set(summary, dayHeaderRow);
  return dayHeaderRow;
}

type DaySummary = ListTransfersResponse["days"][number];
