import { prisma, Prisma } from "@fh/db";
import type { CreatePriceAlertInput, PriceAlertView } from "@fh/domain/alerts";
import type { FlightSearchInput } from "@fh/domain/flights";
import { emit } from "./events";
import { searchFlights } from "./flights";
import "./notify"; // registers event handlers for the in-process (no-Redis) mode

const MAX_WATCHES_PER_USER = 20;
const SCAN_BATCH = 200;

export class AlertError extends Error {
  constructor(readonly code: "LIMIT" | "NOT_FOUND" | "NO_PRICE", message: string) {
    super(message);
    this.name = "AlertError";
  }
}

const day = (d: Date) => d.toISOString().slice(0, 10);
const asDate = (s: string) => new Date(`${s}T00:00:00Z`);

type WatchRow = Prisma.PriceWatchGetPayload<object>;
const toView = (w: WatchRow): PriceAlertView => ({
  id: w.id,
  tripType: w.tripType,
  origin: w.origin,
  destination: w.destination,
  departDate: day(w.departDate),
  returnDate: w.returnDate ? day(w.returnDate) : null,
  cabin: w.cabin,
  adults: w.adults,
  children: w.children,
  currency: w.currency,
  targetPriceMinor: w.targetPriceMinor === null ? null : Number(w.targetPriceMinor),
  dropPercent: w.dropPercent === null ? null : Number(w.dropPercent),
  baselineMinor: w.baselineMinor === null ? null : Number(w.baselineMinor),
  lastSeenMinor: w.lastSeenMinor === null ? null : Number(w.lastSeenMinor),
  lastCheckedAt: w.lastCheckedAt?.toISOString() ?? null,
  active: w.active,
  expiresAt: w.expiresAt.toISOString(),
});

const searchParamsFor = (w: Pick<WatchRow, "tripType" | "origin" | "destination" | "departDate" | "returnDate" | "adults" | "children" | "cabin" | "currency">): FlightSearchInput => ({
  tripType: w.tripType,
  origin: w.origin,
  destination: w.destination,
  departureDate: day(w.departDate),
  returnDate: w.returnDate ? day(w.returnDate) : undefined,
  adults: w.adults,
  children: w.children,
  infants: 0,
  cabinClass: w.cabin,
  currency: w.currency,
});

/** Closer departures change price faster, so they're checked more often. */
function checkInterval(departDate: Date): number {
  const days = (departDate.getTime() - Date.now()) / 86_400_000;
  const h = days > 60 ? 12 : days > 14 ? 6 : 2;
  return h * 3_600_000;
}

// ───────────────────────────── CRUD ─────────────────────────────

export async function createPriceAlert(userId: string, input: CreatePriceAlertInput): Promise<PriceAlertView> {
  const count = await prisma.priceWatch.count({ where: { userId, deletedAt: null, active: true } });
  if (count >= MAX_WATCHES_PER_USER) throw new AlertError("LIMIT", `You can have up to ${MAX_WATCHES_PER_USER} active alerts.`);

  const departDate = asDate(input.departDate);
  // Baseline = the price today; "drop %" is measured against it. Search is cached, so this is usually free.
  const res = await searchFlights({
    tripType: input.tripType, origin: input.origin, destination: input.destination,
    departureDate: input.departDate, returnDate: input.returnDate,
    adults: input.adults, children: input.children, infants: 0, cabinClass: input.cabin, currency: input.currency,
  });
  const baseline = res.data[0]?.price.totalMinor ?? null;

  const w = await prisma.priceWatch.create({
    data: {
      userId,
      tripType: input.tripType, origin: input.origin, destination: input.destination,
      departDate, returnDate: input.returnDate ? asDate(input.returnDate) : null,
      cabin: input.cabin, adults: input.adults, children: input.children, currency: input.currency,
      targetPriceMinor: input.targetPriceMinor ? BigInt(input.targetPriceMinor) : null,
      dropPercent: input.dropPercent ?? null,
      baselineMinor: baseline === null ? null : BigInt(baseline),
      lastSeenMinor: baseline === null ? null : BigInt(baseline),
      lastCheckedAt: new Date(),
      nextCheckAt: new Date(Date.now() + checkInterval(departDate)),
      expiresAt: departDate, // alerts end the day the flight leaves
    },
  });
  return toView(w);
}

export async function listPriceAlerts(userId: string): Promise<PriceAlertView[]> {
  const rows = await prisma.priceWatch.findMany({ where: { userId, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 100 });
  return rows.map(toView);
}

export async function setAlertActive(userId: string, id: string, active: boolean) {
  const res = await prisma.priceWatch.updateMany({ where: { id, userId, deletedAt: null }, data: { active, nextCheckAt: active ? new Date() : null } });
  if (res.count === 0) throw new AlertError("NOT_FOUND", "Alert not found");
}

export async function deletePriceAlert(userId: string, id: string) {
  const res = await prisma.priceWatch.updateMany({ where: { id, userId, deletedAt: null }, data: { deletedAt: new Date(), active: false, nextCheckAt: null } });
  if (res.count === 0) throw new AlertError("NOT_FOUND", "Alert not found");
}

// ───────────────────────────── scanner ─────────────────────────────

/** Whether the new lowest fare should alert. Only alerts again on a *further* drop below the last alert. */
export function shouldAlert(w: Pick<WatchRow, "targetPriceMinor" | "dropPercent" | "baselineMinor" | "lastNotifiedMinor">, price: number): boolean {
  const hitsTarget = w.targetPriceMinor !== null && price <= Number(w.targetPriceMinor);
  const hitsDrop = w.dropPercent !== null && w.baselineMinor !== null && price <= Number(w.baselineMinor) * (1 - Number(w.dropPercent) / 100);
  if (!hitsTarget && !hitsDrop) return false;
  return w.lastNotifiedMinor === null || price < Number(w.lastNotifiedMinor);
}

/**
 * Checks every due watch. Watches for the same itinerary share one search (and the search cache),
 * so 1,000 watchers of JFK→LHR cost one provider call. Returns counts for logging.
 */
export async function scanPriceWatches() {
  const now = new Date();
  // Expire finished watches first.
  await prisma.priceWatch.updateMany({ where: { active: true, expiresAt: { lt: now } }, data: { active: false, nextCheckAt: null } });

  const due = await prisma.priceWatch.findMany({
    where: { active: true, deletedAt: null, nextCheckAt: { lte: now } },
    orderBy: { nextCheckAt: "asc" },
    take: SCAN_BATCH,
  });

  const groups = new Map<string, WatchRow[]>();
  for (const w of due) {
    const key = [w.tripType, w.origin, w.destination, day(w.departDate), w.returnDate ? day(w.returnDate) : "-", w.cabin, w.adults, w.children, w.currency].join("|");
    groups.set(key, [...(groups.get(key) ?? []), w]);
  }

  let checked = 0, alerted = 0, failed = 0;
  for (const watches of groups.values()) {
    const sample = watches[0];
    let lowest: number | null;
    try {
      const res = await searchFlights(searchParamsFor(sample));
      lowest = res.data[0]?.price.totalMinor ?? null;
    } catch (e) {
      failed += watches.length;
      console.error("[alerts] search failed", sample.origin, sample.destination, (e as Error).message);
      // Retry soon rather than waiting a full interval.
      await prisma.priceWatch.updateMany({ where: { id: { in: watches.map((w) => w.id) } }, data: { nextCheckAt: new Date(Date.now() + 15 * 60_000) } });
      continue;
    }

    if (lowest !== null) {
      await prisma.priceSnapshot.create({
        data: {
          routeKey: `${sample.origin}-${sample.destination}:${sample.tripType === "ROUND_TRIP" ? "RT" : "OW"}:${sample.cabin}`,
          origin: sample.origin, destination: sample.destination,
          departDate: sample.departDate, returnDate: sample.returnDate,
          cabin: sample.cabin, lowestMinor: BigInt(lowest), currency: sample.currency, provider: "amadeus",
        },
      });
    }

    for (const w of watches) {
      checked++;
      await prisma.priceWatch.update({
        where: { id: w.id },
        data: {
          lastCheckedAt: now,
          nextCheckAt: new Date(Date.now() + checkInterval(w.departDate)),
          ...(lowest !== null ? { lastSeenMinor: BigInt(lowest), baselineMinor: w.baselineMinor ?? BigInt(lowest) } : {}),
        },
      });
      if (lowest !== null && shouldAlert(w, lowest)) {
        alerted++;
        const previous = Number(w.lastNotifiedMinor ?? w.baselineMinor ?? lowest);
        await emit("price.alert.triggered", { watchId: w.id, newPriceMinor: lowest, previousMinor: previous }, { jobId: `price-${w.id}-${lowest}` });
      }
    }
  }
  return { due: due.length, groups: groups.size, checked, alerted, failed };
}
