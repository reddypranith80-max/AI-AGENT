import type { FlightStatus, TrackingSnapshot } from "@fh/domain/tracking";
import { ProviderError, httpJson } from "../errors";
import type { TrackingProvider, TrackingQuery } from "./provider";

// FlightAware AeroAPI v4. Only the fields we read.
type FaAirport = { code_iata?: string | null; code?: string | null } | null;
type FaFlight = {
  fa_flight_id: string;
  ident_iata?: string | null;
  operator_iata?: string | null;
  origin: FaAirport;
  destination: FaAirport;
  cancelled: boolean;
  diverted: boolean;
  scheduled_out: string | null;
  scheduled_off: string | null;
  scheduled_on: string | null;
  scheduled_in: string | null;
  estimated_out: string | null;
  estimated_in: string | null;
  actual_out: string | null;
  actual_off: string | null;
  actual_on: string | null;
  actual_in: string | null;
  departure_delay?: number | null; // seconds
  arrival_delay?: number | null;
  gate_origin?: string | null;
  gate_destination?: string | null;
  terminal_origin?: string | null;
  terminal_destination?: string | null;
  baggage_claim?: string | null;
  progress_percent?: number | null;
  last_position?: {
    latitude: number;
    longitude: number;
    altitude: number; // hundreds of feet
    groundspeed: number; // knots
    heading: number;
    timestamp: string;
  } | null;
};

export class FlightAwareProvider implements TrackingProvider {
  readonly name = "flightaware";

  constructor(private readonly cfg: { apiKey: string; baseUrl?: string; timeoutMs?: number }) {}

  static fromEnv() {
    const apiKey = process.env.FLIGHTAWARE_API_KEY;
    if (!apiKey) throw new Error("FLIGHTAWARE_API_KEY is not configured");
    return new FlightAwareProvider({ apiKey });
  }

  async lookup(q: TrackingQuery, opts: { signal?: AbortSignal } = {}): Promise<TrackingSnapshot | null> {
    const ident = `${q.airlineIata}${q.flightNumber}`;
    const day = (offset: number) =>
      new Date(Date.parse(`${q.date}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 19) + "Z";
    // ±1 day window: the user's local date can differ from the UTC date of departure.
    const qs = new URLSearchParams({ start: day(-1), end: day(2), max_pages: "1" });

    let json: { flights?: FaFlight[] };
    try {
      json = await httpJson(
        `${this.cfg.baseUrl ?? "https://aeroapi.flightaware.com/aeroapi"}/flights/${encodeURIComponent(ident)}?${qs}`,
        { headers: { "x-apikey": this.cfg.apiKey, Accept: "application/json" } },
        { timeoutMs: this.cfg.timeoutMs ?? 8_000, signal: opts.signal, vendor: "FlightAware", allow404: true },
      );
    } catch (err) {
      if (err instanceof ProviderError && err.kind === "not_found") return null;
      throw err;
    }

    const flights = (json.flights ?? []).filter((f) => f.scheduled_out || f.scheduled_off);
    if (flights.length === 0) return null;

    // Pick the leg matching the hint (or the target schedule), else the one nearest the requested date.
    const target = q.hint ? Date.parse(q.hint.scheduledDepartAt) : Date.parse(`${q.date}T12:00:00Z`);
    const dist = (f: FaFlight) => Math.abs(Date.parse((f.scheduled_out ?? f.scheduled_off)!) - target);
    const byRef = q.hint?.providerRef ? flights.find((f) => f.fa_flight_id === q.hint!.providerRef) : undefined;
    const best = byRef ?? [...flights].sort((a, b) => dist(a) - dist(b))[0];
    return normalize(best, q);
  }
}

function normalize(f: FaFlight, q: TrackingQuery): TrackingSnapshot {
  const schedDep = f.scheduled_out ?? f.scheduled_off!;
  const schedArr = f.scheduled_in ?? f.scheduled_on ?? schedDep;
  const delayMin = f.departure_delay != null && f.actual_off == null ? Math.round(f.departure_delay / 60) : f.arrival_delay != null ? Math.round(f.arrival_delay / 60) : null;

  let status: FlightStatus = "SCHEDULED";
  if (f.cancelled) status = "CANCELLED";
  else if (f.diverted) status = "DIVERTED";
  else if (f.actual_in || f.actual_on) status = "LANDED";
  else if (f.actual_off) status = "EN_ROUTE";
  else if (f.actual_out) status = "DEPARTED"; // pushed back, not yet airborne
  else if (delayMin !== null && delayMin >= 15) status = "DELAYED";
  else if (f.estimated_out && Date.parse(f.estimated_out) - Date.now() < 45 * 60_000 && Date.parse(f.estimated_out) > Date.now()) status = "BOARDING";

  const p = f.last_position;
  return {
    providerRef: f.fa_flight_id,
    airlineIata: (f.operator_iata ?? q.airlineIata).toUpperCase(),
    flightNumber: q.flightNumber,
    originIata: f.origin?.code_iata ?? q.hint?.originIata ?? "",
    destinationIata: f.destination?.code_iata ?? q.hint?.destinationIata ?? "",
    status,
    scheduledDepartAt: schedDep,
    scheduledArriveAt: schedArr,
    estimatedDepartAt: f.estimated_out ?? null,
    estimatedArriveAt: f.estimated_in ?? null,
    actualDepartAt: f.actual_off ?? f.actual_out ?? null,
    actualArriveAt: f.actual_in ?? f.actual_on ?? null,
    depTerminal: f.terminal_origin ?? null,
    depGate: f.gate_origin ?? null,
    arrTerminal: f.terminal_destination ?? null,
    arrGate: f.gate_destination ?? null,
    baggageBelt: f.baggage_claim ?? null,
    delayMinutes: delayMin,
    progressPercent: f.progress_percent ?? null,
    position:
      p && status !== "LANDED"
        ? {
            lat: p.latitude,
            lon: p.longitude,
            altitudeFt: p.altitude != null ? p.altitude * 100 : null,
            speedKts: p.groundspeed ?? null,
            headingDeg: p.heading ?? null,
            onGround: !f.actual_off || (p.altitude ?? 1) === 0,
            recordedAt: p.timestamp,
          }
        : null,
  };
}
