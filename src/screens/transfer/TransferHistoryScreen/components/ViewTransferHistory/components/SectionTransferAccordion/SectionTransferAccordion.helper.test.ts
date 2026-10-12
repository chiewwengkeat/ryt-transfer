import { reuseTransferDayHeaderRow } from "./SectionTransferAccordion.helper";

it("hands back the same header row while a day's summary and open state stay the same", () => {
  expect(reuseTransferDayHeaderRow(daySummary, true)).toBe(
    reuseTransferDayHeaderRow(daySummary, true),
  );
  expect(reuseTransferDayHeaderRow(daySummary, false)).toBe(
    reuseTransferDayHeaderRow(daySummary, false),
  );
});

it("makes a new header row when the day's summary or its open state changes", () => {
  expect(reuseTransferDayHeaderRow(daySummary, false)).not.toBe(
    reuseTransferDayHeaderRow(daySummary, true),
  );
  expect(reuseTransferDayHeaderRow({ ...daySummary }, true)).not.toBe(
    reuseTransferDayHeaderRow(daySummary, true),
  );
  expect(reuseTransferDayHeaderRow(daySummary, false)).toEqual({
    summary: daySummary,
    expanded: false,
  });
});

const daySummary = {
  date: "2026-10-05",
  count: 1,
  net: { minor: -5000, currency: "MYR" as const },
};
