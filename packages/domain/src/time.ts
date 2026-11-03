/** Offset (ms) of `tz` from UTC at the given instant. */
function tzOffsetMs(utcMs: number, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]));
  const asIfUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asIfUtc - Math.floor(utcMs / 1000) * 1000;
}

/**
 * Converts an airport-local wall-clock time ("2026-03-01T10:30:00", no offset) into the real UTC instant.
 * Two passes handle times that straddle a DST change.
 */
export function zonedToUtc(local: string, tz: string): Date {
  const asUtc = Date.parse(`${local.slice(0, 19)}Z`);
  let tzName = tz;
  try {
    tzOffsetMs(asUtc, tz);
  } catch {
    tzName = "UTC"; // unknown tz id (e.g. placeholder airport)
  }
  const first = tzOffsetMs(asUtc, tzName);
  let utc = asUtc - first;
  const second = tzOffsetMs(utc, tzName);
  if (second !== first) utc = asUtc - second;
  return new Date(utc);
}

/** Formats a UTC instant as local wall-clock time at `tz`, e.g. "10:30" or "Sat 1 Mar, 10:30". */
export function formatInZone(utc: Date | string, tz: string, opts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hour12: false }): string {
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone: tz, ...opts }).format(new Date(utc));
  } catch {
    return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...opts }).format(new Date(utc));
  }
}
