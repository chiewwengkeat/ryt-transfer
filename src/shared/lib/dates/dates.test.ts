import { formatMalaysianDateTime, formatMalaysianDayHeader } from "./dates";

it.each([
  ["2026-10-06T07:42:00Z", "6 Oct 2026, 3:42 pm"],
  ["2026-10-06T15:42:00+08:00", "6 Oct 2026, 3:42 pm"],
  ["2026-10-06T15:59:59Z", "6 Oct 2026, 11:59 pm"],
  ["2026-10-06T16:00:00Z", "7 Oct 2026, 12:00 am"],
  ["2026-10-06T04:00:00Z", "6 Oct 2026, 12:00 pm"],
])("shows %s in Malaysia time as %s", (instant, text) => {
  expect(formatMalaysianDateTime(instant)).toBe(text);
});

it.each([
  ["2026-10-06T16:00:00Z", "2026-10-07", "Today"],
  ["2026-10-06T16:00:00Z", "2026-10-06", "Yesterday"],
  ["2026-10-06T16:00:00Z", "2026-10-05", "5 Oct 2026"],
  ["2026-10-06T15:59:59Z", "2026-10-06", "Today"],
  ["2026-10-06T15:59:59Z", "2026-10-05", "Yesterday"],
  ["2026-10-31T16:00:00Z", "2026-10-31", "Yesterday"],
])("at %s, heads the day %s as %s", (now, dateKey, header) => {
  expect(formatMalaysianDayHeader(dateKey, new Date(now))).toBe(header);
});

it("refuses an instant it cannot read", () => {
  expect(() => formatMalaysianDateTime("not a date")).toThrow(RangeError);
});
