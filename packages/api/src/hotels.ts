import { createHash } from "node:crypto";
import type { HotelOffer, HotelSearchInput, HotelSearchResponse } from "@fh/domain/hotels";
import { nightsOf } from "@fh/domain/hotels";
import { AmadeusHotelProvider, MockHotelProvider, geocodeCity, type HotelProvider, type HotelProviderParams } from "@fh/providers/hotels";
import { cacheGet, cacheSet } from "./cache";

const RESULT_TTL_SEC = Number(process.env.HOTEL_CACHE_TTL_SEC ?? 600); // 10 min
const OFFER_TTL_SEC = 30 * 60; // normalized offers outlive results so checkout can still resolve them
const RATING_TTL_SEC = 24 * 3600;
const GEOCODE_TTL_SEC = 7 * 24 * 3600;
const RATING_LOOKUPS = 30; // only the cheapest N get a (rate-limited, 3-per-call) sentiment lookup
const DEFAULT_CURRENCY = process.env.DEFAULT_CURRENCY ?? "USD";
const DEFAULT_RADIUS_KM = 15;
const DEFAULT_MIN_STARS = 3;

type CachedSearch = { offers: HotelOffer[]; fetchedAt: string; currency: string; nights: number };

let provider: HotelProvider | undefined;
const getProvider = () => {
  if (provider) return provider;
  const mock = process.env.HOTEL_PROVIDER === "mock" || (!process.env.AMADEUS_CLIENT_ID && process.env.HOTEL_PROVIDER !== "amadeus");
  if (mock) console.warn("[hotels] using the MOCK provider (set AMADEUS_CLIENT_ID/SECRET for live rates)");
  return (provider = mock ? new MockHotelProvider() : AmadeusHotelProvider.fromEnv()); // swap to Booking.com / Expedia here
};

const inflight = new Map<string, Promise<CachedSearch>>();
function coalesce(key: string, fn: () => Promise<CachedSearch>) {
  const existing = inflight.get(key);
  if (existing) return existing;
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

const resKey = (id: string) => `hotels:v1:res:${id}`;
const offersKey = (id: string) => `hotels:v1:offers:${id}`;
const rawKey = (id: string) => `hotels:v1:raw:${id}`;
const ratingKey = (hotelId: string) => `hotels:v1:rating:${hotelId}`;

async function resolveWhere(loc: HotelSearchInput["location"]): Promise<HotelProviderParams["where"]> {
  if (loc.type === "iata") return { kind: "iata", code: loc.code };
  if (loc.type === "coords") return { kind: "coords", lat: loc.lat, lon: loc.lon };
  const key = `geo:v1:${loc.name.toLowerCase()}`;
  const hit = await cacheGet<{ lat: number; lon: number }>(key);
  if (hit) return { kind: "coords", ...hit };
  const g = await geocodeCity(loc.name);
  await cacheSet(key, { lat: g.lat, lon: g.lon }, GEOCODE_TTL_SEC);
  return { kind: "coords", lat: g.lat, lon: g.lon };
}

function searchId(p: HotelProviderParams) {
  const w = p.where.kind === "iata" ? p.where.code : `${p.where.lat.toFixed(3)},${p.where.lon.toFixed(3)}`;
  const canonical = [w, p.checkIn, p.checkOut, p.rooms, p.adults, p.radiusKm, p.stars.join(""), p.currency].join("|");
  return createHash("sha1").update(canonical).digest("hex").slice(0, 16);
}

/** Fills guest ratings for the cheapest hotels, using a 24h per-hotel cache (incl. negative results). */
async function enrichRatings(offers: HotelOffer[]) {
  const targets = [...offers].sort((a, b) => a.price.perNightMinor - b.price.perNightMinor).slice(0, RATING_LOOKUPS);
  const cached = await Promise.all(targets.map((o) => cacheGet<number>(ratingKey(o.hotelId))));
  const missing: string[] = [];
  targets.forEach((o, i) => {
    const c = cached[i];
    if (c === null) missing.push(o.hotelId);
    else if (c >= 0) o.rating = c; // -1 = known to have no rating: keep whatever the provider returned
  });
  if (missing.length === 0) return;

  const fetched = await getProvider().ratings(missing).catch(() => new Map<string, number>());
  await Promise.all(
    missing.map((id) => cacheSet(ratingKey(id), fetched.get(id) ?? -1, RATING_TTL_SEC)),
  );
  for (const o of targets) if (fetched.has(o.hotelId)) o.rating = fetched.get(o.hotelId)!;
}

async function fetchFresh(id: string, p: HotelProviderParams): Promise<CachedSearch> {
  const results = await getProvider().search(p);
  const raw: Record<string, unknown> = {};
  const offers = results.map(({ offer, raw: r }) => {
    raw[offer.hotelId] = r;
    return { ...offer, id: `${id}.${offer.hotelId}` };
  });
  await enrichRatings(offers);

  const entry: CachedSearch = {
    offers,
    fetchedAt: new Date().toISOString(),
    currency: p.currency,
    nights: nightsOf(p.checkIn, p.checkOut),
  };
  await Promise.all([
    cacheSet(resKey(id), entry, RESULT_TTL_SEC),
    cacheSet(offersKey(id), Object.fromEntries(offers.map((o) => [o.id, o])), OFFER_TTL_SEC),
    cacheSet(rawKey(id), raw, OFFER_TTL_SEC),
  ]);
  return entry;
}

/** Returns the full, unfiltered result set; filtering/sorting are pure and applied by the caller. */
export async function searchHotels(input: HotelSearchInput): Promise<HotelSearchResponse> {
  const where = await resolveWhere(input.location);
  const floor = input.minStars ?? DEFAULT_MIN_STARS;
  const p: HotelProviderParams = {
    where,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    rooms: input.rooms,
    adults: input.adults,
    radiusKm: input.radiusKm ?? DEFAULT_RADIUS_KM,
    stars: Array.from({ length: 5 - floor + 1 }, (_, i) => 5 - i), // e.g. [5,4,3]
    currency: input.currency ?? DEFAULT_CURRENCY,
  };
  const id = searchId(p);

  let entry = await cacheGet<CachedSearch>(resKey(id));
  const cached = entry !== null;
  entry ??= await coalesce(id, () => fetchFresh(id, p));

  return {
    data: entry.offers,
    meta: { searchId: id, count: entry.offers.length, cached, fetchedAt: entry.fetchedAt, currency: entry.currency, nights: entry.nights },
  };
}

/** Normalized hotel offer behind a `HotelOffer.id` (null once the cache expired). */
export async function getHotelOffer(offerId: string): Promise<HotelOffer | null> {
  const dot = offerId.indexOf(".");
  if (dot < 1) return null;
  const byId = await cacheGet<Record<string, HotelOffer>>(offersKey(offerId.slice(0, dot)));
  return byId?.[offerId] ?? null;
}

export async function getRawHotelOffer(offerId: string): Promise<unknown | null> {
  const dot = offerId.indexOf(".");
  if (dot < 1) return null;
  const raw = await cacheGet<Record<string, unknown>>(rawKey(offerId.slice(0, dot)));
  return raw?.[offerId.slice(dot + 1)] ?? null;
}
