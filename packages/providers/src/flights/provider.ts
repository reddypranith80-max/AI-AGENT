import type { FlightOffer, FlightSearchInput } from "@fh/domain/flights";

export { ProviderError, type ProviderErrorKind } from "../errors";

export type ProviderSearchParams = Pick<
  FlightSearchInput,
  "origin" | "destination" | "departureDate" | "returnDate" | "adults" | "children" | "infants" | "cabinClass" | "nonStop"
> & { currency: string; max: number };

/** `raw` is kept (server-side only) so checkout can re-price the exact vendor offer. */
export type ProviderOffer = { offer: FlightOffer; raw: unknown };

export interface FlightProvider {
  readonly name: string;
  search(params: ProviderSearchParams, opts?: { signal?: AbortSignal }): Promise<ProviderOffer[]>;
}
