import { createHash } from "node:crypto";
import { sortOffers, type FlightOffer, type FlightSearchInput, type FlightSearchResponse } from "@fh/domain/flights";
import { AmadeusProvider, MockFlightProvider, ProviderError, type FlightProvider } from "@fh/providers/flights";
import { cacheGet, cacheSet } from "./cache";
import { rateLimit } from "./rate-limit";

const RESULT_TTL_SEC = Number(process.env.FLIGHT_CACHE_TTL_SEC ?? 480); // 8 min
const RAW_TTL_SEC = 30 * 60; // raw vendor offers outlive results so checkout can still re-price
const MAX_OFFERS = 50;
const PROVIDER_RPS = Number(process.env.AMADEUS_MAX_RPS ?? 8);
const DEFAULT_CURRENCY = process.env.DEFAULT_CURRENCY ?? "USD";

type CachedSearch = { offers: FlightOffer[]; fetchedAt: string; currency: string };

let provider: FlightProvider | undefined;
/** Amadeus when credentials exist (or FLIGHT_PROVIDER=amadeus); otherwise the keyless mock so the app runs out of the box. */
const getProvider = () => {
  if (provider) return provider;
  const mock = process.env.FLIGHT_PROVIDER === "mock" || (!process.env.AMADEUS_CLIENT_ID && process.env.FLIGHT_PROVIDER !== "amadeus");
  if (mock) console.warn("[flights] using the MOCK provider (set AMADEUS_CLIENT_ID/SECRET for live fares)");
  return (provider = mock ? new MockFlightProvider() : AmadeusProvider.fromEnv()); // swap to Duffel here
};

// Concurrent identical searches in this process share one provider call.
const inflight = new Map<string, Promise<CachedSearch>>();
function coalesce(key: string, fn: () => Promise<CachedSearch>) {
  const existing = inflight.get(key);
  if (existing) return existing;
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

// `sort` is deliberately excluded: sorting is free, so all sorts share one cache entry.
function searchId(p: FlightSearchInput & { currency: string }) {
  const canonical = [
    p.origin, p.destination, p.departureDate, p.returnDate ?? "-",
    p.adults, p.children, p.infants, p.cabinClass, p.nonStop ? 1 : 0, p.currency,
  ].join("|");
  return createHash("sha1").update(canonical).digest("hex").slice(0, 16);
}

const resKey = (id: string) => `flights:v1:res:${id}`;
const rawKey = (id: string) => `flights:v1:raw:${id}`;
const offersKey = (id: string) => `flights:v1:offers:${id}`; // normalized offers by id, long-lived for checkout
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Local outbound throttle so we queue briefly instead of tripping the vendor's 429. */
async function acquireProviderSlot() {
  for (let i = 0; i < 3; i++) {
    if ((await rateLimit(`out:${getProvider().name}`, PROVIDER_RPS, 1)).allowed) return;
    await sleep(150 + Math.random() * 150);
  }
  throw new ProviderError("rate_limited", "Provider budget exhausted", { retryAfterSec: 1 });
}

async function fetchFresh(id: string, p: FlightSearchInput & { currency: string }): Promise<CachedSearch> {
  await acquireProviderSlot();
  const results = await getProvider().search({
    origin: p.origin,
    destination: p.destination,
    departureDate: p.departureDate,
    returnDate: p.tripType === "ROUND_TRIP" ? p.returnDate : undefined,
    adults: p.adults,
    children: p.children,
    infants: p.infants,
    cabinClass: p.cabinClass,
    nonStop: p.nonStop,
    currency: p.currency,
    max: MAX_OFFERS,
  });

  const raw: Record<string, unknown> = {};
  const offers = results.map(({ offer, raw: r }) => {
    raw[offer.id] = r;
    return { ...offer, id: `${id}.${offer.id}`, travelers: { adults: p.adults, children: p.children, infants: p.infants } }; // vendor ids ("1","2"…) are only unique per search
  });

  const entry: CachedSearch = { offers, fetchedAt: new Date().toISOString(), currency: p.currency };
  const byId = Object.fromEntries(offers.map((o) => [o.id, o]));
  await Promise.all([
    cacheSet(resKey(id), entry, RESULT_TTL_SEC),
    cacheSet(offersKey(id), byId, RAW_TTL_SEC),
    cacheSet(rawKey(id), raw, RAW_TTL_SEC),
  ]);
  return entry;
}

export async function searchFlights(input: FlightSearchInput): Promise<FlightSearchResponse> {
  const p = { ...input, currency: input.currency ?? DEFAULT_CURRENCY };
  const id = searchId(p);
  const sort = input.sort ?? "price";

  let entry = await cacheGet<CachedSearch>(resKey(id));
  const cached = entry !== null;
  entry ??= await coalesce(id, () => fetchFresh(id, p));

  return {
    data: sortOffers(entry.offers, sort),
    meta: { searchId: id, count: entry.offers.length, cached, fetchedAt: entry.fetchedAt, currency: entry.currency, sort },
  };
}

/** Normalized offer behind a `FlightOffer.id` (null once the search cache expired). */
export async function getFlightOffer(offerId: string): Promise<FlightOffer | null> {
  const dot = offerId.indexOf(".");
  if (dot < 1) return null;
  const byId = await cacheGet<Record<string, FlightOffer>>(offersKey(offerId.slice(0, dot)));
  return byId?.[offerId] ?? null;
}

/** For the checkout re-price step: returns the untouched vendor offer behind a `FlightOffer.id`. */
export async function getRawOffer(offerId: string): Promise<unknown | null> {
  const dot = offerId.indexOf(".");
  if (dot < 1) return null;
  const raw = await cacheGet<Record<string, unknown>>(rawKey(offerId.slice(0, dot)));
  return raw?.[offerId.slice(dot + 1)] ?? null;
}
