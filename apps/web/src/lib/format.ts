import { formatInZone } from "@fh/domain/time";

export { formatMoney, formatDuration } from "@fh/domain/flights";

/** "19:30" */
export const clock = (utcOrLocal: string | Date, tz: string) => formatInZone(utcOrLocal, tz);
/** "Sat 1 Mar" */
export const dayLabel = (utc: string | Date, tz: string) => formatInZone(utc, tz, { weekday: "short", day: "numeric", month: "short" });
/** "Sat 1 Mar, 19:30" */
export const dateTime = (utc: string | Date, tz: string) =>
  formatInZone(utc, tz, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

/** Airport-local wall-clock strings from flight search ("2026-03-01T10:30:00") are already local: slice, don't convert. */
export const localClock = (local: string) => local.slice(11, 16);
export const localDay = (local: string) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${local.slice(0, 10)}T00:00:00Z`));

/** YYYY-MM-DD → "Sat 1 Mar" */
export const dateOnly = (isoDate: string) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${isoDate}T00:00:00Z`));

export function relativeTime(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m}m ago` : `${Math.round(m / 60)}h ago`;
}

export const stopsLabel = (n: number) => (n === 0 ? "Non-stop" : `${n} stop${n > 1 ? "s" : ""}`);

export const cabinLabel = (c: string) => c.replace(/_/g, " ").toLowerCase().replace(/^\w/, (x) => x.toUpperCase());
