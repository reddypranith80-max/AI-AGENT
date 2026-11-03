import { z } from "zod";
import { isoDate } from "./flights";

export const FLIGHT_STATUSES = [
  "SCHEDULED", "BOARDING", "DEPARTED", "EN_ROUTE", "LANDED", "DELAYED", "CANCELLED", "DIVERTED", "UNKNOWN",
] as const;
export type FlightStatus = (typeof FLIGHT_STATUSES)[number];

/** Terminal states: polling stops and SSE streams end. */
export const FINAL_STATUSES: readonly FlightStatus[] = ["LANDED", "CANCELLED", "DIVERTED"];
export const isFinalStatus = (s: FlightStatus) => FINAL_STATUSES.includes(s);

export const trackByFlightSchema = z.object({
  flightNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2}\s?\d{1,4}[A-Z]?$/, "Use a flight number like BA100")
    .transform((s) => s.replace(/\s/g, "")),
  date: isoDate,
});
export type TrackByFlightInput = z.infer<typeof trackByFlightSchema>;

export type TrackedPosition = {
  lat: number;
  lon: number;
  altitudeFt: number | null;
  speedKts: number | null;
  headingDeg: number | null;
  onGround: boolean;
  recordedAt: string; // ISO UTC
};

/** What a tracking provider returns, already normalized. All instants are UTC ISO strings. */
export type TrackingSnapshot = {
  providerRef: string | null;
  airlineIata: string;
  flightNumber: string; // numeric part
  originIata: string;
  destinationIata: string;
  status: FlightStatus;
  scheduledDepartAt: string;
  scheduledArriveAt: string;
  estimatedDepartAt: string | null;
  estimatedArriveAt: string | null;
  actualDepartAt: string | null;
  actualArriveAt: string | null;
  depTerminal: string | null;
  depGate: string | null;
  arrTerminal: string | null;
  arrGate: string | null;
  baggageBelt: string | null;
  delayMinutes: number | null;
  progressPercent: number | null;
  position: TrackedPosition | null;
};

export type StatusEventKind =
  | "DELAY" | "ETA_CHANGE" | "CANCELLATION" | "GATE_CHANGE" | "TERMINAL_CHANGE" | "DEPARTED" | "LANDED" | "DIVERTED";

export type TrackedEvent = {
  id: string;
  kind: StatusEventKind;
  oldValue: unknown;
  newValue: unknown;
  detectedAt: string;
};

export type TrackedAirport = { iata: string; name: string; city: string; lat: number | null; lon: number | null; timezone: string };

/** The full picture the UI renders; also the SSE `snapshot` payload. */
export type TrackedFlightView = {
  flightInstanceId: string;
  flightNumber: string; // "BA100"
  airlineIata: string;
  origin: TrackedAirport;
  destination: TrackedAirport;
  status: FlightStatus;
  scheduledDepartAt: string;
  scheduledArriveAt: string;
  estimatedDepartAt: string | null;
  estimatedArriveAt: string | null;
  actualDepartAt: string | null;
  actualArriveAt: string | null;
  depTerminal: string | null;
  depGate: string | null;
  arrTerminal: string | null;
  arrGate: string | null;
  baggageBelt: string | null;
  delayMinutes: number | null;
  position: TrackedPosition | null;
  /** Recent breadcrumb trail (oldest → newest) for drawing the flown path. */
  trail: { lat: number; lon: number }[];
  events: TrackedEvent[];
  /** True once the flight reached a terminal state; the stream closes after sending this. */
  done: boolean;
};

/** Server-Sent Events payloads on /api/track/[id]. */
export type TrackingStreamMessage =
  | { type: "snapshot"; flight: TrackedFlightView }
  | { type: "position"; flightInstanceId: string; position: TrackedPosition }
  | { type: "status"; flight: TrackedFlightView }
  | { type: "end"; flightInstanceId: string; reason: "LANDED" | "CANCELLED" | "DIVERTED" | "STOPPED" };

/** Pub/sub channel carrying TrackingStreamMessage JSON for one flight instance. */
export const trackingChannel = (flightInstanceId: string) => `track:${flightInstanceId}`;

/** Great-circle fraction helper for the mock provider and for map placeholders. */
export function interpolate(a: { lat: number; lon: number }, b: { lat: number; lon: number }, t: number) {
  return { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t };
}

export function bearing(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = Math.PI / 180;
  const y = Math.sin((b.lon - a.lon) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lon - a.lon) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}

/** n+1 points along the great circle from a to b (spherical interpolation), for drawing flight paths. */
export function greatCircle(a: { lat: number; lon: number }, b: { lat: number; lon: number }, n = 64): { lat: number; lon: number }[] {
  const r = Math.PI / 180;
  const [la1, lo1, la2, lo2] = [a.lat * r, a.lon * r, b.lat * r, b.lon * r];
  const d = 2 * Math.asin(Math.sqrt(Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2));
  if (d === 0) return [a];
  return Array.from({ length: n + 1 }, (_, i) => {
    const f = i / n;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
    const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
    const z = A * Math.sin(la1) + B * Math.sin(la2);
    return { lat: Math.atan2(z, Math.sqrt(x * x + y * y)) / r, lon: Math.atan2(y, x) / r };
  });
}
