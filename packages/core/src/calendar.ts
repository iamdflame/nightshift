/**
 * US equity market clock.
 *
 * Tokenized stocks trade 24/7; their underlying does not. Everything in Nightshift is
 * conditioned on which session the underlying is in, so this module is the single source
 * of truth for that question. Times are computed in America/New_York wall-clock time so
 * DST transitions are handled by the platform's tz database, not by hand.
 *
 * Sessions (ET):
 *   overnight 20:00–04:00 (Sun evening through Fri morning, 24/5 venues)
 *   pre       04:00–09:30
 *   regular   09:30–16:00 (13:00 on early-close days)
 *   post      16:00–20:00 (13:00–17:00 on early-close days)
 *   closed    Fri 20:00 → Sun 20:00, full holidays — the "dark" hours with no reference price
 */

export type Session = "overnight" | "pre" | "regular" | "post" | "closed";

const NY = "America/New_York";

/** NYSE full-day closures (ET calendar dates). */
const HOLIDAYS = new Set<string>([
  // 2026
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25",
  "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
  // 2027
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31",
  "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
]);

/** NYSE early closes at 13:00 ET. */
const EARLY_CLOSES = new Set<string>(["2026-11-27", "2026-12-24", "2027-11-26"]);

interface EtParts {
  date: string; // YYYY-MM-DD in ET
  weekday: number; // 0=Sun … 6=Sat
  minutes: number; // minutes since ET midnight
}

const fmt = new Intl.DateTimeFormat("en-US", {
  timeZone: NY,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
  hourCycle: "h23",
});

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function etParts(ms: number): EtParts {
  const parts = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAYS[parts.weekday as string] ?? 0,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

export const isHoliday = (etDate: string): boolean => HOLIDAYS.has(etDate);
export const isEarlyClose = (etDate: string): boolean => EARLY_CLOSES.has(etDate);

/** A trading day is a weekday that is not a full holiday. */
export function isTradingDay(etDate: string, weekday: number): boolean {
  return weekday >= 1 && weekday <= 5 && !isHoliday(etDate);
}

const H = 60;

/** Which session the underlying US market is in at instant `ms`. */
export function sessionAt(ms: number): Session {
  const { date, weekday, minutes } = etParts(ms);
  const trading = isTradingDay(date, weekday);
  const early = isEarlyClose(date);
  const regularEnd = early ? 13 * H : 16 * H;
  const postEnd = early ? 17 * H : 20 * H;

  if (trading) {
    if (minutes < 4 * H) return overnightOpenBefore(ms) ? "overnight" : "closed";
    if (minutes < 9 * H + 30) return "pre";
    if (minutes < regularEnd) return "regular";
    if (minutes < postEnd) return "post";
    // Evening: the overnight session runs only if the next calendar day is a trading day.
    return nextDayIsTradingDay(ms) ? "overnight" : "closed";
  }
  // Non-trading day (weekend or holiday): only the evening before a trading day is overnight.
  if (minutes >= 20 * H && nextDayIsTradingDay(ms)) return "overnight";
  return "closed";
}

/** True when the overnight session that covers the early morning of `ms` actually opened the previous evening. */
function overnightOpenBefore(ms: number): boolean {
  // The early-morning overnight segment exists when the day itself is a trading day; the evening
  // before may have been a weekend/holiday evening, which still opens at 20:00 ET for a trading day.
  const { date, weekday } = etParts(ms);
  return isTradingDay(date, weekday);
}

function nextDayIsTradingDay(ms: number): boolean {
  // Step to the next ET calendar day robustly across DST by probing +26h until the date changes.
  const today = etParts(ms).date;
  for (let probe = ms + 3 * 3600_000; probe < ms + 30 * 3600_000; probe += 3600_000) {
    const p = etParts(probe);
    if (p.date !== today) return isTradingDay(p.date, p.weekday);
  }
  return false;
}

/** UTC epoch ms of `etDate` at `minutes` past ET midnight. */
export function etToUtc(etDate: string, minutes: number): number {
  const [y, m, d] = etDate.split("-").map(Number) as [number, number, number];
  // Guess using a UTC instant, then correct by the observed ET offset (handles DST).
  const guess = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  for (const offsetH of [4, 5]) {
    const candidate = guess + offsetH * 3600_000;
    const p = etParts(candidate);
    if (p.date === etDate && p.minutes === minutes) return candidate;
  }
  throw new Error(`cannot map ET ${etDate} ${minutes}m to UTC`);
}

/** The next regular-session open strictly after `ms` (UTC epoch ms). */
export function nextRegularOpen(ms: number): number {
  let probe = ms;
  for (let i = 0; i < 15; i++) {
    const { date, weekday } = etParts(probe);
    if (isTradingDay(date, weekday)) {
      const open = etToUtc(date, 9 * H + 30);
      if (open > ms) return open;
    }
    probe += 24 * 3600_000;
  }
  throw new Error("no regular open within 15 days");
}

/** The most recent regular-session close at or before `ms`. */
export function lastRegularClose(ms: number): number {
  let probe = ms;
  for (let i = 0; i < 15; i++) {
    const { date, weekday } = etParts(probe);
    if (isTradingDay(date, weekday)) {
      const close = etToUtc(date, isEarlyClose(date) ? 13 * H : 16 * H);
      if (close <= ms) return close;
    }
    probe -= 24 * 3600_000;
  }
  throw new Error("no regular close within 15 days");
}

/** Hours from `ms` until the next regular open — the horizon the dark-hours forecast must cover. */
export const hoursToOpen = (ms: number): number => (nextRegularOpen(ms) - ms) / 3600_000;
