import type { CabinClass, FlightOffer, FlightSegmentView, FlightSlice } from "@fh/domain/flights";
import { AmadeusClient } from "../amadeus-client";
import type { FlightProvider, ProviderOffer, ProviderSearchParams } from "./provider";

// Only the fields we read.
type AmadeusSegment = {
  id: string;
  carrierCode: string;
  number: string;
  duration: string;
  departure: { iataCode: string; terminal?: string; at: string };
  arrival: { iataCode: string; terminal?: string; at: string };
  aircraft?: { code: string };
  operating?: { carrierCode?: string };
};
type AmadeusFare = {
  segmentId: string;
  cabin: CabinClass;
  includedCheckedBags?: { quantity?: number; weight?: number };
};
type AmadeusOffer = {
  id: string;
  itineraries: { duration: string; segments: AmadeusSegment[] }[];
  price: { currency: string; grandTotal?: string; total: string };
  validatingAirlineCodes?: string[];
  numberOfBookableSeats?: number;
  travelerPricings?: { fareDetailsBySegment: AmadeusFare[] }[];
};
type AmadeusResponse = {
  data?: AmadeusOffer[];
  dictionaries?: { carriers?: Record<string, string>; aircraft?: Record<string, string> };
};

export class AmadeusProvider implements FlightProvider {
  readonly name = "amadeus";

  constructor(private readonly client: AmadeusClient) {}

  static fromEnv() {
    return new AmadeusProvider(AmadeusClient.fromEnv());
  }

  async search(p: ProviderSearchParams, opts: { signal?: AbortSignal } = {}): Promise<ProviderOffer[]> {
    const json = await this.client.request<AmadeusResponse>(
      "/v2/shopping/flight-offers",
      {
        method: "POST",
        // Amadeus's POST variant of a GET endpoint requires this override header.
        headers: { "Content-Type": "application/json", "X-HTTP-Method-Override": "GET" },
        body: JSON.stringify(buildBody(p)),
      },
      opts.signal,
    );

    const ctx: Ctx = {
      carriers: json.dictionaries?.carriers ?? {},
      aircraft: json.dictionaries?.aircraft ?? {},
      cabinFallback: p.cabinClass,
      fractionDigits: fractionDigits(p.currency),
    };

    // One malformed offer must not sink the whole search.
    return (json.data ?? []).flatMap((raw): ProviderOffer[] => {
      try {
        return [{ offer: normalizeOffer(raw, ctx), raw }];
      } catch (err) {
        console.error("[amadeus] skipped offer", raw.id, (err as Error).message);
        return [];
      }
    });
  }
}

// ───────────────────────────── request body ─────────────────────────────

function buildBody(p: ProviderSearchParams) {
  const legs = [{ from: p.origin, to: p.destination, date: p.departureDate }];
  if (p.returnDate) legs.push({ from: p.destination, to: p.origin, date: p.returnDate });

  const travelers: Record<string, string>[] = [];
  let id = 1;
  for (let i = 0; i < p.adults; i++) travelers.push({ id: String(id++), travelerType: "ADULT" });
  for (let i = 0; i < p.children; i++) travelers.push({ id: String(id++), travelerType: "CHILD" });
  // Infants sit on an adult's lap; adult ids are 1..adults and infants ≤ adults (validated upstream).
  for (let i = 0; i < p.infants; i++)
    travelers.push({ id: String(id++), travelerType: "HELD_INFANT", associatedAdultId: String(i + 1) });

  const legIds = legs.map((_, i) => String(i + 1));
  return {
    currencyCode: p.currency,
    originDestinations: legs.map((l, i) => ({
      id: legIds[i],
      originLocationCode: l.from,
      destinationLocationCode: l.to,
      departureDateTimeRange: { date: l.date },
    })),
    travelers,
    sources: ["GDS"],
    searchCriteria: {
      maxFlightOffers: p.max,
      flightFilters: {
        cabinRestrictions: [{ cabin: p.cabinClass, coverage: "MOST_SEGMENTS", originDestinationIds: legIds }],
        ...(p.nonStop ? { connectionRestriction: { maxNumberOfConnections: 0 } } : {}),
      },
    },
  };
}

// ───────────────────────────── normalization ─────────────────────────────

type Ctx = {
  carriers: Record<string, string>;
  aircraft: Record<string, string>;
  cabinFallback: CabinClass;
  fractionDigits: number;
};

export function normalizeOffer(o: AmadeusOffer, ctx: Ctx): FlightOffer {
  const fares = o.travelerPricings?.[0]?.fareDetailsBySegment ?? [];
  const fareBySegment = new Map(fares.map((f) => [f.segmentId, f]));
  const carrier = (code: string) => ({ code, name: ctx.carriers[code] ? titleCase(ctx.carriers[code]) : code });

  const slices = o.itineraries.map((it, i): FlightSlice => {
    const segments = it.segments.map((s): FlightSegmentView => {
      const op = s.operating?.carrierCode;
      return {
        flightNumber: `${s.carrierCode}${s.number}`,
        carrier: carrier(s.carrierCode),
        ...(op && op !== s.carrierCode ? { operatedBy: carrier(op) } : {}),
        aircraft: s.aircraft ? (ctx.aircraft[s.aircraft.code] ?? s.aircraft.code) : undefined,
        origin: { iata: s.departure.iataCode, terminal: s.departure.terminal },
        destination: { iata: s.arrival.iataCode, terminal: s.arrival.terminal },
        departLocal: s.departure.at,
        arriveLocal: s.arrival.at,
        durationMin: parseDuration(s.duration),
        cabin: fareBySegment.get(s.id)?.cabin ?? ctx.cabinFallback,
      };
    });
    const first = segments[0];
    const last = segments[segments.length - 1];
    return {
      direction: i === 0 ? "OUTBOUND" : "RETURN",
      origin: first.origin.iata,
      destination: last.destination.iata,
      departLocal: first.departLocal,
      arriveLocal: last.arriveLocal,
      durationMin: parseDuration(it.duration),
      stops: segments.length - 1,
      segments,
    };
  });

  const bags = fares[0]?.includedCheckedBags;
  return {
    id: o.id,
    price: { totalMinor: toMinor(o.price.grandTotal ?? o.price.total, ctx.fractionDigits), currency: o.price.currency },
    slices,
    totalDurationMin: slices.reduce((n, s) => n + s.durationMin, 0),
    stops: Math.max(...slices.map((s) => s.stops)),
    validatingCarrier: carrier(o.validatingAirlineCodes?.[0] ?? slices[0].segments[0].carrier.code),
    seatsLeft: o.numberOfBookableSeats ?? null,
    // Some fares state a weight allowance instead of a piece count → treat as one bag.
    checkedBags: bags ? (bags.quantity ?? (bags.weight ? 1 : null)) : null,
    travelers: { adults: 0, children: 0, infants: 0 }, // filled in by the search service, which knows the party
  };
}

// "PT7H30M" | "P1DT2H5M" → minutes
export function parseDuration(iso: string): number {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(iso);
  if (!m) throw new Error(`Bad duration ${iso}`);
  return Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

export const fractionDigits = (currency: string) =>
  new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2; // JPY → 0

export const toMinor = (amount: string, digits: number) => Math.round(Number(amount) * 10 ** digits);
export const titleCase = (s: string) => s.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
