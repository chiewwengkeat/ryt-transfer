import { t } from "i18next";

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

export function formatMalaysianDateTime(instant: string) {
  const wallClock = new Date(Date.parse(instant) + MALAYSIA_OFFSET_MS);
  const hour = wallClock.getUTCHours();
  return t("date.date_time", {
    date: formatDayMonthYear(wallClock),
    time: t("date.time", {
      hour: hour % 12 || 12,
      minute: String(wallClock.getUTCMinutes()).padStart(2, "0"),
      period: hour < 12 ? t("date.am") : t("date.pm"),
    }),
  });
}

export function formatMalaysianDayHeader(malaysianIsoDate: string, now: Date) {
  const nowInMalaysia = new Date(now.getTime() + MALAYSIA_OFFSET_MS);
  if (malaysianIsoDate === nowInMalaysia.toISOString().slice(0, 10))
    return t("date.today");
  if (
    malaysianIsoDate ===
    new Date(nowInMalaysia.getTime() - DAY_MS).toISOString().slice(0, 10)
  )
    return t("date.yesterday");
  return formatDayMonthYear(new Date(`${malaysianIsoDate}T00:00:00Z`));
}

function formatDayMonthYear(wallClock: Date) {
  const monthKey = MONTH_KEYS[wallClock.getUTCMonth()];
  if (monthKey === undefined) throw new RangeError("Invalid time value");
  return t("date.day_month_year", {
    day: wallClock.getUTCDate(),
    month: t(`date.month_short.${monthKey}`),
    year: wallClock.getUTCFullYear(),
  });
}
