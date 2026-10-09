import type { Namespace, TFunction } from "i18next";

// No daylight saving in Malaysia: a fixed shift plus UTC getters reads the same on every phone, with no Intl zone data.
const MALAYSIA_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_KEYS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
] as const;

// The caller's t: the React Compiler caches a call by its arguments, so only a t that changes with the language
// reformats. Every key names shared because a caller's t looks only in the caller's own namespace.
export function formatMalaysianDateTime(
  instant: string,
  t: TFunction<Namespace>,
) {
  return t("shared:date.date_time", {
    date: formatDayMonthYear(
      new Date(Date.parse(instant) + MALAYSIA_OFFSET_MS),
      t,
    ),
    time: formatMalaysianTime(instant, t),
  });
}

export function formatMalaysianDayHeader(
  malaysianIsoDate: string,
  now: Date,
  t: TFunction<Namespace>,
) {
  const nowInMalaysia = new Date(now.getTime() + MALAYSIA_OFFSET_MS);
  if (malaysianIsoDate === nowInMalaysia.toISOString().slice(0, 10))
    return t("shared:date.today");
  if (
    malaysianIsoDate ===
    new Date(nowInMalaysia.getTime() - DAY_MS).toISOString().slice(0, 10)
  )
    return t("shared:date.yesterday");
  return formatDayMonthYear(new Date(`${malaysianIsoDate}T00:00:00Z`), t);
}

// Null rather than a throw, as for an unreadable amount: one bad row must not blank a list.
export function formatMalaysianTime(instant: string, t: TFunction<Namespace>) {
  const wallClock = new Date(Date.parse(instant) + MALAYSIA_OFFSET_MS);
  if (Number.isNaN(wallClock.getTime())) return null;
  const hour = wallClock.getUTCHours();
  return t("shared:date.time", {
    hour: hour % 12 || 12,
    minute: String(wallClock.getUTCMinutes()).padStart(2, "0"),
    period: hour < 12 ? t("shared:date.am") : t("shared:date.pm"),
  });
}

export function toMalaysianDateKey(instant: string) {
  const wallClock = new Date(Date.parse(instant) + MALAYSIA_OFFSET_MS);
  return Number.isNaN(wallClock.getTime())
    ? null
    : wallClock.toISOString().slice(0, 10);
}

function formatDayMonthYear(wallClock: Date, t: TFunction<Namespace>) {
  const monthKey = MONTH_KEYS[wallClock.getUTCMonth()];
  if (monthKey === undefined) throw new RangeError("Invalid time value");
  return t("shared:date.day_month_year", {
    day: wallClock.getUTCDate(),
    month: t(`shared:date.month_short.${monthKey}`),
    year: wallClock.getUTCFullYear(),
  });
}
