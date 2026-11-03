import { z } from "zod";
import { type FlightOffer, isoDate, iata, isRealDate } from "./flights";

// ───────────────────────────── Normalized types ─────────────────────────────

export const HOTEL_SORTS = ["recommended", "price", "rating"] as const;
export type HotelSort = (typeof HOTEL_SORTS)[number];

export type HotelOffer = {
  /** `${searchId}.${hotelId}`: unique, resolves back to the cached offer at booking time. */
  id: string;
  hotelId: string;
  name: string;
  /** 1–5. Known because stars are searched as buckets (the vendor doesn't return them per hotel). */
  stars: number;
  /** Guest rating on a 0–10 scale; null when the vendor has no sentiment data. */
  rating: number | null;
  location: { lat: number; lon: number };
  distanceKm: number | null;
  city: string | null;
  countryCode: string | null;
  room: { offerId: string; type: string; description: string | null; beds: string | null };
  boardType: string | null;
  nights: number;
  price: { totalMinor: number; perNightMinor: number; currency: string };
  cancellation: { free: boolean; freeUntil: string | null };
  checkIn: string; // YYYY-MM-DD
  checkOut: string;
};

export type HotelSearchMeta = {
  searchId: string;
  count: number;
  cached: boolean;
  fetchedAt: string;
  currency: string;
  nights: number;
};
export type HotelSearchResponse = { data: HotelOffer[]; meta: HotelSearchMeta };

// ───────────────────────────── Request schema ─────────────────────────────

const todayIso = () => new Date().toISOString().slice(0, 10);
const nightsBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

export const hotelLocationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("iata"), code: iata }), // city or airport code
  z.object({ type: z.literal("city"), name: z.string().trim().min(2).max(80) }), // geocoded server-side
  z.object({
    type: z.literal("coords"),
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
  }),
]);
export type HotelLocation = z.infer<typeof hotelLocationSchema>;

const hotelShape = z.object({
  location: hotelLocationSchema,
  checkIn: isoDate,
  checkOut: isoDate,
  rooms: z.number().int().min(1).max(5),
  adults: z.number().int().min(1).max(9),
  radiusKm: z.number().int().min(1).max(50).optional(),
  /** Searched as vendor-side star buckets (minStars..5), so changing it refetches. */
  minStars: z.number().int().min(1).max(5).optional(),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
  /** Link back to the chosen flight; informational (the dates/location already carry its context). */
  flightOfferId: z.string().min(1).optional(),
});

export const hotelSearchSchema = hotelShape.superRefine((v, ctx) => {
  const issue = (path: keyof typeof v, message: string) =>
    ctx.addIssue({ code: "custom", path: [path], message });
  if (isRealDate(v.checkIn) && v.checkIn < todayIso()) issue("checkIn", "Check-in is in the past");
  if (isRealDate(v.checkIn) && isRealDate(v.checkOut)) {
    const n = nightsBetween(v.checkIn, v.checkOut);
    if (n < 1) issue("checkOut", "Minimum stay is 1 night");
    if (n > 30) issue("checkOut", "Maximum stay is 30 nights");
  }
  if (v.rooms > v.adults) issue("rooms", "Each room needs at least one adult");
});
export type HotelSearchInput = z.infer<typeof hotelSearchSchema>;

/** Filters that never trigger a refetch: applied to the cached result set on both server and client. */
export const hotelFilterSchema = z.object({
  minStars: z.number().int().min(1).max(5).optional(),
  maxPricePerNightMinor: z.number().int().positive().optional(),
  minPricePerNightMinor: z.number().int().nonnegative().optional(),
  freeCancellation: z.boolean().optional(),
  minRating: z.number().min(0).max(10).optional(),
});
export type HotelFilters = z.infer<typeof hotelFilterSchema>;

// ───────────────────────────── Query-string helpers ─────────────────────────────

export function hotelSearchToQuery(p: HotelSearchInput): URLSearchParams {
  const q = new URLSearchParams();
  q.set("loc", p.location.type === "iata" ? `iata:${p.location.code}` : p.location.type === "city" ? `city:${p.location.name}` : `geo:${p.location.lat},${p.location.lon}`);
  q.set("checkIn", p.checkIn);
  q.set("checkOut", p.checkOut);
  q.set("rooms", String(p.rooms));
  q.set("adults", String(p.adults));
  if (p.radiusKm) q.set("radiusKm", String(p.radiusKm));
  if (p.minStars) q.set("minStars", String(p.minStars));
  if (p.currency) q.set("currency", p.currency);
  if (p.flightOfferId) q.set("flightOfferId", p.flightOfferId);
  return q;
}

export function parseHotelSearchQuery(sp: URLSearchParams) {
  const num = (k: string, d?: number) => {
    const v = sp.get(k);
    return v === null || v === "" ? d : Number(v);
  };
  const loc = sp.get("loc") ?? "";
  let location: unknown;
  if (loc.startsWith("iata:")) location = { type: "iata", code: loc.slice(5) };
  else if (loc.startsWith("city:")) location = { type: "city", name: loc.slice(5) };
  else if (loc.startsWith("geo:")) {
    const [lat, lon] = loc.slice(4).split(",").map(Number);
    location = { type: "coords", lat, lon };
  }
  return hotelSearchSchema.safeParse({
    location,
    checkIn: sp.get("checkIn") || undefined,
    checkOut: sp.get("checkOut") || undefined,
    rooms: num("rooms", 1),
    adults: num("adults", 2),
    radiusKm: num("radiusKm"),
    minStars: num("minStars"),
    currency: sp.get("currency") || undefined,
    flightOfferId: sp.get("flightOfferId") || undefined,
  });
}

// ───────────────────────────── Filtering + sorting (pure) ─────────────────────────────

export function filterHotels(offers: readonly HotelOffer[], f: HotelFilters = {}): HotelOffer[] {
  return offers.filter(
    (o) =>
      (f.minStars === undefined || o.stars >= f.minStars) &&
      (f.maxPricePerNightMinor === undefined || o.price.perNightMinor <= f.maxPricePerNightMinor) &&
      (f.minPricePerNightMinor === undefined || o.price.perNightMinor >= f.minPricePerNightMinor) &&
      (!f.freeCancellation || o.cancellation.free) &&
      (f.minRating === undefined || (o.rating !== null && o.rating >= f.minRating)),
  );
}

/**
 * "recommended" blends price and guest rating:
 *   score = 0.6 · (1 − price position in [min,max]) + 0.4 · rating/10
 * Hotels without a rating get the set's median rating, so missing data neither helps nor hurts.
 */
export function sortHotels(offers: readonly HotelOffer[], sort: HotelSort = "recommended"): HotelOffer[] {
  const list = [...offers];
  const byPrice = (a: HotelOffer, b: HotelOffer) => a.price.perNightMinor - b.price.perNightMinor;
  if (sort === "price") return list.sort(byPrice);
  if (sort === "rating") return list.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1) || byPrice(a, b));

  if (list.length === 0) return list;
  const prices = list.map((o) => o.price.perNightMinor);
  const min = Math.min(...prices);
  const span = Math.max(...prices) - min || 1;
  const rated = list.flatMap((o) => (o.rating === null ? [] : [o.rating])).sort((a, b) => a - b);
  const median = rated.length ? rated[Math.floor(rated.length / 2)] : 7;
  const score = (o: HotelOffer) =>
    0.6 * (1 - (o.price.perNightMinor - min) / span) + 0.4 * ((o.rating ?? median) / 10);
  return list.sort((a, b) => score(b) - score(a) || byPrice(a, b));
}

// ───────────────────────────── Flight → hotel linking ─────────────────────────────

/**
 * Derives hotel search params from a chosen flight: stay starts the day the outbound lands
 * and ends the day the return departs. One-way trips default to 3 nights (user-editable).
 */
export function hotelSearchFromFlight(
  offer: FlightOffer,
  pax: { adults: number } = { adults: 1 },
): Pick<HotelSearchInput, "location" | "checkIn" | "checkOut" | "rooms" | "adults" | "flightOfferId"> {
  const outbound = offer.slices[0];
  const ret = offer.slices.find((s) => s.direction === "RETURN");
  const checkIn = outbound.arriveLocal.slice(0, 10);
  const checkOut = ret
    ? ret.departLocal.slice(0, 10)
    : new Date(Date.parse(checkIn) + 3 * 86_400_000).toISOString().slice(0, 10);
  return {
    location: { type: "iata", code: outbound.destination },
    checkIn,
    checkOut,
    rooms: 1,
    adults: Math.max(1, pax.adults),
    flightOfferId: offer.id,
  };
}

export const nightsOf = nightsBetween;
