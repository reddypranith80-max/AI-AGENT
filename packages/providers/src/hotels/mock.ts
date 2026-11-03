import type { HotelOffer } from "@fh/domain/hotels";
import { airport, hash, rng } from "../mock-data";
import type { HotelProvider, HotelProviderOffer, HotelProviderParams } from "./provider";

const PREFIX = ["Grand", "Royal", "Park", "Central", "Riverside", "Boutique", "Skyline", "Harbour", "Garden", "Metropolitan", "Historic", "Urban"];
const SUFFIX = ["Hotel", "Suites", "Inn", "Residences", "Lodge", "Palace", "House"];
const ROOMS = ["Standard Room", "Superior Room", "Deluxe Double", "Junior Suite", "Executive Room"];
const BEDS = ["1 Queen bed", "2 Twin beds", "1 King bed"];
const BOARD = [null, "Room Only", "Breakfast Included", "Half Board"];
const BASE_PER_NIGHT: Record<number, number> = { 1: 40, 2: 65, 3: 105, 4: 170, 5: 340 };

/** Keyless hotel provider for local development and demos (deterministic per search). */
export class MockHotelProvider implements HotelProvider {
  readonly name = "mock";

  async search(p: HotelProviderParams): Promise<HotelProviderOffer[]> {
    await new Promise((r) => setTimeout(r, 300));
    const where = p.where.kind === "iata" ? p.where.code : `${p.where.lat.toFixed(2)},${p.where.lon.toFixed(2)}`;
    const city = p.where.kind === "iata" ? airport(p.where.code).city : "Downtown";
    const nights = Math.max(1, Math.round((Date.parse(p.checkOut) - Date.parse(p.checkIn)) / 86_400_000));
    const digits = new Intl.NumberFormat("en", { style: "currency", currency: p.currency }).resolvedOptions().maximumFractionDigits ?? 2;

    const out: HotelProviderOffer[] = [];
    for (const stars of p.stars) {
      const rand = rng(hash(`${where}|${p.checkIn}|${stars}`));
      const n = stars >= 4 ? 6 : 8;
      for (let i = 0; i < n; i++) {
        const name = `${PREFIX[Math.floor(rand() * PREFIX.length)]} ${city} ${SUFFIX[Math.floor(rand() * SUFFIX.length)]}`;
        const id = `MK${stars}${String(hash(where + name + i) % 100000).padStart(5, "0")}`;
        const perNight = BASE_PER_NIGHT[stars] * (0.7 + rand() * 0.9) * Math.max(1, p.rooms);
        const totalMinor = Math.round(perNight * nights * 10 ** digits);
        const free = rand() < 0.55;
        const freeUntil = free ? new Date(Date.parse(`${p.checkIn}T12:00:00Z`) - 2 * 86_400_000).toISOString() : null;
        const rating = Math.round((5.8 + stars * 0.55 + rand() * 1.6) * 10) / 10;
        const offer: HotelOffer = {
          id, hotelId: id, name, stars,
          rating: Math.min(9.8, rating),
          location: { lat: airport(p.where.kind === "iata" ? p.where.code : "LHR").lat + (rand() - 0.5) * 0.1, lon: airport(p.where.kind === "iata" ? p.where.code : "LHR").lon + (rand() - 0.5) * 0.1 },
          distanceKm: Math.round(rand() * 120) / 10 + 0.3,
          city, countryCode: null,
          room: { offerId: `OFF-${id}`, type: ROOMS[Math.floor(rand() * ROOMS.length)], description: null, beds: BEDS[Math.floor(rand() * BEDS.length)] },
          boardType: BOARD[Math.floor(rand() * BOARD.length)],
          nights,
          price: { totalMinor, perNightMinor: Math.round(totalMinor / nights), currency: p.currency },
          cancellation: { free, freeUntil },
          checkIn: p.checkIn, checkOut: p.checkOut,
        };
        out.push({ offer, raw: { mock: true, id } });
      }
    }
    return out;
  }

  async ratings(): Promise<Map<string, number>> {
    return new Map(); // ratings are already part of the mock offers
  }
}
