/** Shared helpers for the keyless mock providers (deterministic: same input → same results). */

export type MockAirport = { lat: number; lon: number; utc: number; city: string };

// utc = standard offset in hours (DST ignored; this is demo data).
export const MOCK_AIRPORTS: Record<string, MockAirport> = {
  JFK: { lat: 40.64, lon: -73.78, utc: -5, city: "New York" }, EWR: { lat: 40.69, lon: -74.17, utc: -5, city: "Newark" },
  LAX: { lat: 33.94, lon: -118.41, utc: -8, city: "Los Angeles" }, SFO: { lat: 37.62, lon: -122.38, utc: -8, city: "San Francisco" },
  ORD: { lat: 41.97, lon: -87.91, utc: -6, city: "Chicago" }, ATL: { lat: 33.64, lon: -84.43, utc: -5, city: "Atlanta" },
  MIA: { lat: 25.79, lon: -80.29, utc: -5, city: "Miami" }, YYZ: { lat: 43.68, lon: -79.63, utc: -5, city: "Toronto" },
  LHR: { lat: 51.47, lon: -0.45, utc: 0, city: "London" }, LGW: { lat: 51.15, lon: -0.18, utc: 0, city: "London" },
  CDG: { lat: 49.01, lon: 2.55, utc: 1, city: "Paris" }, AMS: { lat: 52.31, lon: 4.77, utc: 1, city: "Amsterdam" },
  FRA: { lat: 50.04, lon: 8.56, utc: 1, city: "Frankfurt" }, MAD: { lat: 40.49, lon: -3.57, utc: 1, city: "Madrid" },
  FCO: { lat: 41.8, lon: 12.25, utc: 1, city: "Rome" }, ZRH: { lat: 47.46, lon: 8.55, utc: 1, city: "Zurich" },
  IST: { lat: 41.26, lon: 28.74, utc: 3, city: "Istanbul" }, DXB: { lat: 25.25, lon: 55.37, utc: 4, city: "Dubai" },
  DOH: { lat: 25.27, lon: 51.61, utc: 3, city: "Doha" }, DEL: { lat: 28.56, lon: 77.1, utc: 5.5, city: "Delhi" },
  BOM: { lat: 19.09, lon: 72.87, utc: 5.5, city: "Mumbai" }, HYD: { lat: 17.24, lon: 78.43, utc: 5.5, city: "Hyderabad" },
  BLR: { lat: 13.2, lon: 77.71, utc: 5.5, city: "Bengaluru" }, SIN: { lat: 1.36, lon: 103.99, utc: 8, city: "Singapore" },
  HKG: { lat: 22.31, lon: 113.91, utc: 8, city: "Hong Kong" }, NRT: { lat: 35.77, lon: 140.39, utc: 9, city: "Tokyo" },
  HND: { lat: 35.55, lon: 139.78, utc: 9, city: "Tokyo" }, ICN: { lat: 37.46, lon: 126.44, utc: 9, city: "Seoul" },
  SYD: { lat: -33.94, lon: 151.18, utc: 10, city: "Sydney" }, MEL: { lat: -37.67, lon: 144.84, utc: 10, city: "Melbourne" },
  GRU: { lat: -23.43, lon: -46.47, utc: -3, city: "São Paulo" }, JNB: { lat: -26.14, lon: 28.25, utc: 2, city: "Johannesburg" },
};
export const HUBS = ["LHR", "FRA", "AMS", "DXB", "DOH", "IST", "CDG", "JFK", "SIN"];

export const AIRLINES = [
  { code: "BA", name: "British Airways" }, { code: "LH", name: "Lufthansa" }, { code: "AF", name: "Air France" },
  { code: "EK", name: "Emirates" }, { code: "QR", name: "Qatar Airways" }, { code: "DL", name: "Delta Air Lines" },
  { code: "AA", name: "American Airlines" }, { code: "UA", name: "United Airlines" }, { code: "AI", name: "Air India" },
  { code: "TK", name: "Turkish Airlines" }, { code: "SQ", name: "Singapore Airlines" }, { code: "KL", name: "KLM" },
];

export function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** mulberry32: small, fast, seedable PRNG. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Known airport, or a stable pseudo-location so every 3-letter code still produces a coherent result. */
export function airport(iata: string): MockAirport {
  const known = MOCK_AIRPORTS[iata];
  if (known) return known;
  const r = rng(hash(iata));
  return { lat: r() * 120 - 50, lon: r() * 300 - 150, utc: Math.round((r() * 20 - 8) * 2) / 2, city: iata };
}

export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = Math.PI / 180;
  const d = Math.acos(Math.min(1, Math.sin(a.lat * r) * Math.sin(b.lat * r) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lon - a.lon) * r)));
  return d * 6371;
}

const pad = (n: number) => String(n).padStart(2, "0");
/** (local date, minutes from local midnight) → "YYYY-MM-DDTHH:MM:00" (rolling over days as needed). */
export function localStamp(date: string, minutes: number): string {
  const d = new Date(Date.parse(`${date}T00:00:00Z`) + minutes * 60_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00`;
}
