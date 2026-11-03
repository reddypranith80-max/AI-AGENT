import type { HotelOffer } from "@fh/domain/hotels";

export { ProviderError, type ProviderErrorKind } from "../errors";

export type HotelProviderParams = {
  /** Already resolved: city names are geocoded to coords before reaching the provider. */
  where: { kind: "iata"; code: string } | { kind: "coords"; lat: number; lon: number };
  checkIn: string;
  checkOut: string;
  rooms: number;
  adults: number;
  radiusKm: number;
  /** Star buckets to query (e.g. [3,4,5]); the vendor filters by rating, so each bucket tags its hotels. */
  stars: number[];
  currency: string;
};

/** `raw` is kept server-side so booking can reference the exact vendor offer. */
export type HotelProviderOffer = { offer: HotelOffer; raw: unknown };

export interface HotelProvider {
  readonly name: string;
  search(params: HotelProviderParams, opts?: { signal?: AbortSignal }): Promise<HotelProviderOffer[]>;
  /** Guest ratings on a 0–10 scale. Best-effort: missing ids simply have no rating. */
  ratings(hotelIds: string[], opts?: { signal?: AbortSignal }): Promise<Map<string, number>>;
}
