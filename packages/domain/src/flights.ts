import { z } from "zod";

// Plain literals (not Prisma imports) so this file is safe in client bundles.
// Keep in sync with the Prisma enums.
export const TRIP_TYPES = ["ONE_WAY", "ROUND_TRIP"] as const;
export const CABIN_CLASSES = ["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS", "FIRST"] as const;
export const FLIGHT_SORTS = ["price", "duration"] as const;

export type TripType = (typeof TRIP_TYPES)[number];
export type CabinClass = (typeof CABIN_CLASSES)[number];
export type FlightSort = (typeof FLIGHT_SORTS)[number];

// ───────────────────────── Normalized offer types ─────────────────────────

export type Carrier = { code: string; name: string };

export type FlightSegmentView = {
  flightNumber: string; // "BA100"
  carrier: Carrier;
  operatedBy?: Carrier; // set only for codeshares
  aircraft?: string;
  origin: { iata: string; terminal?: string };
  destination: { iata: string; terminal?: string };
  // Airport-local wall-clock time, no offset ("2026-03-01T10:30:00"). Show as-is;
  // never run through `new Date()`, which would shift it into the viewer's timezone.
  departLocal: string;
  arriveLocal: string;
  durationMin: number;
  cabin: CabinClass;
};

export type FlightSlice = {
  direction: "OUTBOUND" | "RETURN";
  origin: string;
  destination: string;
  departLocal: string;
  arriveLocal: string;
  durationMin: number;
  stops: number;
  segments: FlightSegmentView[];
};

export type FlightOffer = {
  /** `${searchId}.${providerOfferId}`: globally unique, used to re-price at checkout. */
  id: string;
  /** Total for ALL travellers, taxes included. */
  price: { totalMinor: number; currency: string };
  slices: FlightSlice[];
  totalDurationMin: number;
  stops: number; // worst slice
  validatingCarrier: Carrier;
  seatsLeft: number | null;
  checkedBags: number | null; // null = unknown
  /** Party the offer was priced for; booking passengers must match it exactly. */
  travelers: { adults: number; children: number; infants: number };
};

export type FlightSearchMeta = {
  searchId: string;
  count: number;
  cached: boolean;
  fetchedAt: string;
  currency: string;
  sort: FlightSort;
};
export type FlightSearchResponse = { data: FlightOffer[]; meta: FlightSearchMeta };
export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    retryAfterSec?: number;
    issues?: Record<string, string[] | undefined>;
  };
};

// ───────────────────────────── Request schema ─────────────────────────────

const MAX_ADVANCE_DAYS = 330; // GDS booking horizon

const todayIso = () => new Date().toISOString().slice(0, 10);
const addDays = (iso: string, n: number) =>
  new Date(Date.parse(iso) + n * 86_400_000).toISOString().slice(0, 10);
export const isRealDate = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  !Number.isNaN(Date.parse(s)) &&
  new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s; // rejects 2026-02-30

export const iata = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Enter a 3-letter airport code");
export const isoDate = z.string().refine(isRealDate, "Select a date");

const shape = z.object({
  tripType: z.enum(TRIP_TYPES),
  origin: iata,
  destination: iata,
  departureDate: isoDate,
  returnDate: isoDate.optional(),
  adults: z.number().int().min(1).max(9),
  children: z.number().int().min(0).max(8),
  infants: z.number().int().min(0).max(4),
  cabinClass: z.enum(CABIN_CLASSES),
  nonStop: z.boolean().optional(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
  sort: z.enum(FLIGHT_SORTS).optional(),
});

export const flightSearchSchema = shape.superRefine((v, ctx) => {
  const issue = (path: keyof typeof v, message: string) =>
    ctx.addIssue({ code: "custom", path: [path], message });

  if (v.origin && v.origin === v.destination)
    issue("destination", "Origin and destination must differ");

  if (isRealDate(v.departureDate)) {
    // One day of grace: the server's UTC "today" can lag the user's local date.
    if (v.departureDate < addDays(todayIso(), -1)) issue("departureDate", "Departure date is in the past");
    if (v.departureDate > addDays(todayIso(), MAX_ADVANCE_DAYS))
      issue("departureDate", `Flights can be searched up to ${MAX_ADVANCE_DAYS} days ahead`);
  }

  if (v.tripType === "ROUND_TRIP") {
    if (!v.returnDate) issue("returnDate", "Select a return date");
    else if (isRealDate(v.departureDate) && v.returnDate < v.departureDate)
      issue("returnDate", "Return can't be before departure");
  } else if (v.returnDate) {
    issue("returnDate", "Remove the return date for a one-way trip");
  }

  if (v.adults + v.children > 9) issue("adults", "Maximum 9 travellers (adults + children)");
  if (v.infants > v.adults) issue("infants", "Each infant needs an adult");
});

export type FlightSearchInput = z.infer<typeof flightSearchSchema>;

// ─────────────────────────── Query-string helpers ───────────────────────────

export function flightSearchToQuery(p: FlightSearchInput): URLSearchParams {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined || v === false || v === "") continue;
    q.set(k, String(v));
  }
  return q;
}

/** Applies defaults, coerces numbers, then validates. Used by the API route and the page. */
export function parseFlightSearchQuery(sp: URLSearchParams) {
  const str = (k: string) => sp.get(k) || undefined;
  const num = (k: string, d: number) => {
    const v = sp.get(k);
    return v === null || v === "" ? d : Number(v);
  };
  const returnDate = str("returnDate");
  return flightSearchSchema.safeParse({
    tripType: str("tripType") ?? (returnDate ? "ROUND_TRIP" : "ONE_WAY"),
    origin: str("origin"),
    destination: str("destination"),
    departureDate: str("departureDate"),
    returnDate,
    adults: num("adults", 1),
    children: num("children", 0),
    infants: num("infants", 0),
    cabinClass: str("cabinClass") ?? "ECONOMY",
    nonStop: sp.get("nonStop") === "true" ? true : undefined,
    currency: str("currency"),
    sort: str("sort"),
  });
}

// ───────────────────────────────── Sorting ─────────────────────────────────

/** Pure and shared: the server honours `sort`, the client re-sorts without refetching. */
export function sortOffers(offers: readonly FlightOffer[], sort: FlightSort = "price"): FlightOffer[] {
  const byPrice = (a: FlightOffer, b: FlightOffer) => a.price.totalMinor - b.price.totalMinor;
  const byTime = (a: FlightOffer, b: FlightOffer) => a.totalDurationMin - b.totalDurationMin;
  return [...offers].sort(
    sort === "price" ? (a, b) => byPrice(a, b) || byTime(a, b) : (a, b) => byTime(a, b) || byPrice(a, b),
  );
}

// ───────────────────────────────── Formatting ─────────────────────────────────

export function formatMoney(totalMinor: number, currency: string, locale = "en"): string {
  const digits = new Intl.NumberFormat(locale, { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: digits }).format(
    totalMinor / 10 ** digits,
  );
}

export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h ${m.toString().padStart(2, "0")}m` : `${m}m`;
}
