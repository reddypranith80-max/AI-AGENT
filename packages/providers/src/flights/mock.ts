import type { CabinClass, FlightOffer, FlightSegmentView, FlightSlice } from "@fh/domain/flights";
import { AIRLINES, HUBS, airport, distanceKm, hash, localStamp, rng } from "../mock-data";
import type { FlightProvider, ProviderOffer, ProviderSearchParams } from "./provider";

const CABIN_FACTOR: Record<CabinClass, number> = { ECONOMY: 1, PREMIUM_ECONOMY: 1.7, BUSINESS: 3.2, FIRST: 5.5 };
const CRUISE_KMH = 820;

/**
 * Keyless flight provider for local development and demos. Deterministic per search, produces a
 * realistic spread of non-stop / 1-stop / 2-stop options, prices scaled by distance, cabin and party.
 */
export class MockFlightProvider implements FlightProvider {
  readonly name = "mock";

  async search(p: ProviderSearchParams): Promise<ProviderOffer[]> {
    await new Promise((r) => setTimeout(r, 350)); // feel like a network call
    const seedBase = hash([p.origin, p.destination, p.departureDate, p.returnDate ?? "-", p.cabinClass].join("|"));
    const rand = rng(seedBase);
    const count = Math.min(p.max, 22);

    return Array.from({ length: count }, (_, i): ProviderOffer => {
      const stops = i % 5 === 0 ? 2 : i % 3 === 0 ? 1 : i % 4 === 1 ? 1 : 0;
      const carrier = AIRLINES[Math.floor(rand() * AIRLINES.length)];
      const out = this.slice("OUTBOUND", p.origin, p.destination, p.departureDate, stops, carrier, p.cabinClass, rand);
      const back = p.returnDate ? this.slice("RETURN", p.destination, p.origin, p.returnDate, stops, carrier, p.cabinClass, rand) : null;
      const slices = back ? [out, back] : [out];

      const km = distanceKm(airport(p.origin), airport(p.destination));
      const perPerson = (60 + km * 0.085) * CABIN_FACTOR[p.cabinClass] * (1 + (rand() - 0.5) * 0.45) * (stops === 0 ? 1.18 : stops === 1 ? 1 : 0.9);
      const party = p.adults + p.children * 0.75 + p.infants * 0.1;
      const trips = back ? 1.85 : 1;
      const total = Math.round(perPerson * party * trips);
      const digits = new Intl.NumberFormat("en", { style: "currency", currency: p.currency }).resolvedOptions().maximumFractionDigits ?? 2;

      const offer: FlightOffer = {
        id: String(i + 1),
        price: { totalMinor: total * 10 ** digits, currency: p.currency },
        slices,
        totalDurationMin: slices.reduce((n, s) => n + s.durationMin, 0),
        stops: Math.max(...slices.map((s) => s.stops)),
        validatingCarrier: carrier,
        seatsLeft: rand() < 0.3 ? 1 + Math.floor(rand() * 4) : rand() < 0.5 ? 9 : null,
        checkedBags: p.cabinClass === "ECONOMY" ? (rand() < 0.5 ? 0 : 1) : 2,
        travelers: { adults: 0, children: 0, infants: 0 },
      };
      return { offer, raw: { mock: true, id: offer.id } };
    }).filter((o) => !p.nonStop || o.offer.stops === 0);
  }

  private slice(
    direction: "OUTBOUND" | "RETURN", from: string, to: string, date: string, stops: number,
    carrier: { code: string; name: string }, cabin: CabinClass, rand: () => number,
  ): FlightSlice {
    const hubs = HUBS.filter((h) => h !== from && h !== to);
    const route = [from, ...Array.from({ length: stops }, (_, k) => hubs[Math.floor(rand() * hubs.length)] ?? hubs[k]), to];
    const startLocal = 5 * 60 + Math.floor(rand() * 17 * 4) * 15; // local minutes after midnight at origin (05:00–22:00)
    let utcClock = startLocal - airport(from).utc * 60; // minutes since UTC midnight of `date`, for arithmetic
    const segments: FlightSegmentView[] = [];

    for (let s = 0; s < route.length - 1; s++) {
      const a = route[s], b = route[s + 1];
      const A = airport(a), B = airport(b);
      const dur = Math.round((distanceKm(A, B) / CRUISE_KMH) * 60 + 35);
      const departLocal = localStamp(date, utcClock + A.utc * 60);
      utcClock += dur;
      const arriveLocal = localStamp(date, utcClock + B.utc * 60);
      segments.push({
        flightNumber: `${carrier.code}${100 + Math.floor(rand() * 899)}`,
        carrier,
        aircraft: ["BOEING 777-300ER", "AIRBUS A350-900", "BOEING 787-9", "AIRBUS A320"][Math.floor(rand() * 4)],
        origin: { iata: a, terminal: String(1 + Math.floor(rand() * 5)) },
        destination: { iata: b, terminal: String(1 + Math.floor(rand() * 5)) },
        departLocal, arriveLocal, durationMin: dur, cabin,
      });
      utcClock += 55 + Math.floor(rand() * 150); // layover before the next leg
    }
    const first = segments[0], last = segments[segments.length - 1];
    const duration = segments.reduce((n, s) => n + s.durationMin, 0) + (segments.length - 1) * 95;
    return {
      direction, origin: from, destination: to,
      departLocal: first.departLocal, arriveLocal: last.arriveLocal,
      durationMin: duration, stops, segments,
    };
  }
}
