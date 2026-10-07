import {
  formatMalaysianDateTime,
  formatMalaysianDayHeader,
  formatMalaysianTime,
  toMalaysianDateKey,
} from "./dates";

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

it.each([
  ["2026-10-06T07:42:00Z", "3:42 pm"],
  ["2026-10-06T15:42:00+08:00", "3:42 pm"],
  ["2026-10-06T15:59:59Z", "11:59 pm"],
  ["2026-10-06T16:00:00Z", "12:00 am"],
  ["2026-10-06T04:00:00Z", "12:00 pm"],
])("tells the time of %s in Malaysia as %s", (instant, text) => {
  expect(formatMalaysianTime(instant)).toBe(text);
});

it.each([
  ["2026-10-06T15:59:59Z", "2026-10-06"],
  ["2026-10-06T16:00:00Z", "2026-10-07"],
  ["2026-10-06T23:59:59+08:00", "2026-10-06"],
  ["2026-10-07T00:00:00+08:00", "2026-10-07"],
])("puts %s on the Malaysian day %s", (instant, dateKey) => {
  expect(toMalaysianDateKey(instant)).toBe(dateKey);
});

it("refuses a time or day for an instant it cannot read", () => {
  expect(() => formatMalaysianTime("not a date")).toThrow(RangeError);
  expect(() => toMalaysianDateKey("not a date")).toThrow(RangeError);
});
