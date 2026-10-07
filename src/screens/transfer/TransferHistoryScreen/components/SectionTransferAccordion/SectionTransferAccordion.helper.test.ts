import { getTransferDayHeaderRow } from "./SectionTransferAccordion.helper";

const daySummary = {
  date: "2026-10-05",
  count: 1,
  net: { minor: -5000, currency: "MYR" as const },
};

it("hands back the same header row while a day's summary and open state stay the same", () => {
  expect(getTransferDayHeaderRow(daySummary, true)).toBe(
    getTransferDayHeaderRow(daySummary, true),
  );
  expect(getTransferDayHeaderRow(daySummary, false)).toBe(
    getTransferDayHeaderRow(daySummary, false),
  );
});

it("makes a new header row when the day's summary or its open state changes", () => {
  expect(getTransferDayHeaderRow(daySummary, false)).not.toBe(
    getTransferDayHeaderRow(daySummary, true),
  );
  expect(getTransferDayHeaderRow({ ...daySummary }, true)).not.toBe(
    getTransferDayHeaderRow(daySummary, true),
  );
  expect(getTransferDayHeaderRow(daySummary, false)).toEqual({
    summary: daySummary,
    expanded: false,
  });
});
