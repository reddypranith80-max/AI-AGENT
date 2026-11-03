import type { TrackingSnapshot } from "@fh/domain/tracking";

export { ProviderError, type ProviderErrorKind } from "../errors";

export type TrackingQuery = {
  airlineIata: string; // "BA"
  flightNumber: string; // "100"
  /** Local departure date the user typed (YYYY-MM-DD). Providers search a ±1 day window around it. */
  date: string;
  /** Known schedule/route (from an existing FlightInstance or booking); used to pick the right leg and by the mock. */
  hint?: {
    originIata: string;
    destinationIata: string;
    scheduledDepartAt: string;
    scheduledArriveAt: string;
    providerRef?: string | null;
    origin?: { lat: number; lon: number } | null;
    destination?: { lat: number; lon: number } | null;
  };
};

export interface TrackingProvider {
  readonly name: string;
  /** Returns the best-matching flight, or null when the provider doesn't know it. */
  lookup(q: TrackingQuery, opts?: { signal?: AbortSignal }): Promise<TrackingSnapshot | null>;
}
