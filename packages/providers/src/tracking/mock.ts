import { bearing, interpolate, type FlightStatus, type TrackingSnapshot } from "@fh/domain/tracking";
import type { TrackingProvider, TrackingQuery } from "./provider";

/**
 * Deterministic simulator so the whole tracking flow (poll → diff → events → SSE → map → email)
 * works without an API key. The flight is a straight line between two airports; the position is
 * a pure function of the current time, so repeated polls "fly" the plane.
 *
 * Demo behaviour: delay of 25 min appears ~90 min before departure on flights whose hash % 3 == 0,
 * and the departure gate changes ~60 min before departure.
 */

const AIRPORTS: Record<string, { lat: number; lon: number }> = {
  JFK: { lat: 40.6413, lon: -73.7781 }, LHR: { lat: 51.47, lon: -0.4543 }, CDG: { lat: 49.0097, lon: 2.5479 },
  SFO: { lat: 37.6213, lon: -122.379 }, LAX: { lat: 33.9416, lon: -118.4085 }, DXB: { lat: 25.2532, lon: 55.3657 },
  SIN: { lat: 1.3644, lon: 103.9915 }, HND: { lat: 35.5494, lon: 139.7798 }, DEL: { lat: 28.5562, lon: 77.1 },
  BOM: { lat: 19.0896, lon: 72.8656 }, HYD: { lat: 17.2403, lon: 78.4294 }, FRA: { lat: 50.0379, lon: 8.5622 },
  AMS: { lat: 52.3105, lon: 4.7683 }, SYD: { lat: -33.9399, lon: 151.1753 }, ORD: { lat: 41.9742, lon: -87.9073 },
};
const CODES = Object.keys(AIRPORTS);
const CRUISE_KTS = 460;

function hash(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

const km = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const r = Math.PI / 180;
  const d = Math.acos(
    Math.min(1, Math.sin(a.lat * r) * Math.sin(b.lat * r) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lon - a.lon) * r)),
  );
  return d * 6371;
};

export class MockTrackingProvider implements TrackingProvider {
  readonly name = "mock";

  async lookup(q: TrackingQuery): Promise<TrackingSnapshot | null> {
    const h = hash(`${q.airlineIata}${q.flightNumber}`);
    const originIata = q.hint?.originIata ?? CODES[h % CODES.length];
    let destinationIata = q.hint?.destinationIata ?? CODES[(h >>> 8) % CODES.length];
    if (destinationIata === originIata) destinationIata = CODES[((h >>> 8) + 1) % CODES.length];
    const from = q.hint?.origin ?? AIRPORTS[originIata];
    const to = q.hint?.destination ?? AIRPORTS[destinationIata];
    if (!from || !to) return null;

    const now = Date.now();
    const durationMs = (km(from, to) / (CRUISE_KTS * 1.852)) * 3_600_000 + 40 * 60_000; // + taxi/climb
    // Without a hint, invent a schedule: today → departed 20 min ago (so the demo is airborne); other days → 10:00Z.
    const today = new Date(now).toISOString().slice(0, 10);
    const sched = q.hint
      ? Date.parse(q.hint.scheduledDepartAt)
      : q.date === today
        ? Math.floor((now - 20 * 60_000) / 300_000) * 300_000
        : Date.parse(`${q.date}T10:00:00Z`);
    const schedArr = q.hint ? Date.parse(q.hint.scheduledArriveAt) : sched + durationMs;

    const delayMin = h % 3 === 0 && now > sched - 90 * 60_000 ? 25 : 0;
    const dep = sched + delayMin * 60_000;
    const arr = schedArr + delayMin * 60_000;
    const t = (now - dep) / (arr - dep);

    let status: FlightStatus;
    if (h % 17 === 0 && now > sched - 3 * 3_600_000) status = "CANCELLED";
    else if (now >= arr) status = "LANDED";
    else if (now >= dep + 12 * 60_000) status = "EN_ROUTE";
    else if (now >= dep) status = "DEPARTED";
    else if (now >= dep - 40 * 60_000) status = "BOARDING";
    else status = delayMin >= 15 ? "DELAYED" : "SCHEDULED";

    const gateBefore = `A${10 + (h % 20)}`;
    const gate = now > sched - 60 * 60_000 ? `B${5 + ((h >>> 4) % 20)}` : gateBefore;
    const flying = status === "EN_ROUTE" || status === "DEPARTED";
    const frac = Math.min(1, Math.max(0, t));
    const pos = interpolate(from, to, frac);
    const climb = Math.min(1, frac / 0.12, (1 - frac) / 0.12);

    return {
      providerRef: `mock-${q.airlineIata}${q.flightNumber}-${new Date(sched).toISOString().slice(0, 10)}`,
      airlineIata: q.airlineIata,
      flightNumber: q.flightNumber,
      originIata,
      destinationIata,
      status,
      scheduledDepartAt: new Date(sched).toISOString(),
      scheduledArriveAt: new Date(schedArr).toISOString(),
      estimatedDepartAt: new Date(dep).toISOString(),
      estimatedArriveAt: new Date(arr).toISOString(),
      actualDepartAt: now >= dep ? new Date(dep).toISOString() : null,
      actualArriveAt: status === "LANDED" ? new Date(arr).toISOString() : null,
      depTerminal: "2",
      depGate: gate,
      arrTerminal: "1",
      arrGate: status === "LANDED" || frac > 0.8 ? `C${3 + (h % 12)}` : null,
      baggageBelt: status === "LANDED" ? String(1 + (h % 9)) : null,
      delayMinutes: delayMin || null,
      progressPercent: Math.round(frac * 100),
      position: flying
        ? {
            lat: pos.lat,
            lon: pos.lon,
            altitudeFt: Math.round(37_000 * climb),
            speedKts: Math.round(CRUISE_KTS * (0.5 + 0.5 * climb)),
            headingDeg: Math.round(bearing(pos, to)),
            onGround: false,
            recordedAt: new Date(now).toISOString(),
          }
        : null,
    };
  }
}
