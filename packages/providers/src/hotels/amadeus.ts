import type { HotelOffer } from "@fh/domain/hotels";
import { AmadeusClient } from "../amadeus-client";
import { ProviderError } from "../errors";
import type { HotelProvider, HotelProviderOffer, HotelProviderParams } from "./provider";

const HOTELS_PER_BUCKET = 15; // bounds fan-out: ≤ 3 buckets × 15 hotels → ≤ 3 offer calls
const OFFER_CHUNK = 15;
const RATING_CHUNK = 3; // the sentiments endpoint accepts at most 3 ids

type ListHotel = {
  hotelId: string;
  name: string;
  iataCode?: string;
  geoCode?: { latitude: number; longitude: number };
  address?: { countryCode?: string };
  distance?: { value: number; unit: string };
};
type AmadeusHotelOffers = {
  hotel: { hotelId: string; name: string; cityCode?: string; latitude?: number; longitude?: number };
  available?: boolean;
  offers?: {
    id: string;
    checkInDate: string;
    checkOutDate: string;
    boardType?: string;
    room?: {
      type?: string;
      typeEstimated?: { category?: string; beds?: number; bedType?: string };
      description?: { text?: string };
    };
    price: { currency: string; total: string };
    policies?: {
      cancellations?: { deadline?: string }[];
      refundable?: { cancellationRefund?: string };
    };
  }[];
};

export class AmadeusHotelProvider implements HotelProvider {
  readonly name = "amadeus";

  constructor(private readonly client: AmadeusClient) {}

  static fromEnv() {
    return new AmadeusHotelProvider(AmadeusClient.fromEnv());
  }

  async search(p: HotelProviderParams, opts: { signal?: AbortSignal } = {}): Promise<HotelProviderOffer[]> {
    // 1) Hotel List, once per star bucket (the list endpoint filters by rating but doesn't echo it).
    const buckets = await Promise.all(p.stars.map((s) => this.listHotels(p, s, opts.signal).then((h) => ({ s, h }))));
    const byId = new Map<string, { stars: number; hotel: ListHotel }>();
    for (const { s, h } of buckets.sort((a, b) => b.s - a.s))
      for (const hotel of h.slice(0, HOTELS_PER_BUCKET)) if (!byId.has(hotel.hotelId)) byId.set(hotel.hotelId, { stars: s, hotel });
    if (byId.size === 0) return [];

    // 2) Hotel Offers in chunks; tolerate individual chunk failures (one bad property id fails a whole call).
    const ids = [...byId.keys()];
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += OFFER_CHUNK) chunks.push(ids.slice(i, i + OFFER_CHUNK));
    const settled = await Promise.allSettled(chunks.map((c) => this.fetchOffers(p, c, opts.signal)));

    const fatal = settled.find(
      (r): r is PromiseRejectedResult => r.status === "rejected" && !(r.reason instanceof ProviderError && r.reason.kind === "bad_request"),
    );
    const ok = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    if (ok.length === 0 && fatal) throw fatal.reason;

    const nights = Math.round((Date.parse(p.checkOut) - Date.parse(p.checkIn)) / 86_400_000);
    const digits = fractionDigits(p.currency);
    return ok.flatMap((raw): HotelProviderOffer[] => {
      const meta = byId.get(raw.hotel.hotelId);
      const o = raw.available === false ? undefined : raw.offers?.[0];
      if (!meta || !o) return [];
      try {
        return [{ offer: normalize(raw, o, meta, { nights, digits, from: p }), raw }];
      } catch (err) {
        console.error("[amadeus-hotel] skipped", raw.hotel.hotelId, (err as Error).message);
        return [];
      }
    });
  }

  async ratings(hotelIds: string[], opts: { signal?: AbortSignal } = {}): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    const chunks: string[][] = [];
    for (let i = 0; i < hotelIds.length; i += RATING_CHUNK) chunks.push(hotelIds.slice(i, i + RATING_CHUNK));
    await Promise.allSettled(
      chunks.map(async (c) => {
        const json = await this.client.request<{ data?: { hotelId: string; overallRating?: number }[] }>(
          `/v2/e-reputation/hotel-sentiments?hotelIds=${c.join(",")}`,
          {},
          opts.signal,
        );
        for (const s of json.data ?? []) if (s.overallRating != null) out.set(s.hotelId, Math.round(s.overallRating) / 10); // 0–100 → 0–10
      }),
    );
    return out;
  }

  private async listHotels(p: HotelProviderParams, stars: number, signal?: AbortSignal): Promise<ListHotel[]> {
    const common = `radius=${p.radiusKm}&radiusUnit=KM&ratings=${stars}&hotelSource=ALL`;
    const path =
      p.where.kind === "coords"
        ? `/v1/reference-data/locations/hotels/by-geocode?latitude=${p.where.lat}&longitude=${p.where.lon}&${common}`
        : `/v1/reference-data/locations/hotels/by-city?cityCode=${p.where.code}&${common}`;
    try {
      return (await this.client.request<{ data?: ListHotel[] }>(path, {}, signal)).data ?? [];
    } catch (err) {
      if (err instanceof ProviderError && (err.kind === "bad_request" || err.kind === "not_found")) return []; // unknown city / no hotels
      throw err;
    }
  }

  private async fetchOffers(p: HotelProviderParams, ids: string[], signal?: AbortSignal) {
    const perRoomAdults = Math.min(9, Math.max(1, Math.ceil(p.adults / p.rooms)));
    const qs = new URLSearchParams({
      hotelIds: ids.join(","),
      adults: String(perRoomAdults),
      roomQuantity: String(p.rooms),
      checkInDate: p.checkIn,
      checkOutDate: p.checkOut,
      currency: p.currency,
      bestRateOnly: "true",
    });
    const json = await this.client.request<{ data?: AmadeusHotelOffers[] }>(`/v3/shopping/hotel-offers?${qs}`, {}, signal);
    return json.data ?? [];
  }
}

function normalize(
  raw: AmadeusHotelOffers,
  o: NonNullable<AmadeusHotelOffers["offers"]>[number],
  meta: { stars: number; hotel: ListHotel },
  ctx: { nights: number; digits: number; from: HotelProviderParams },
): HotelOffer {
  const totalMinor = Math.round(Number(o.price.total) * 10 ** ctx.digits);
  const refundable = o.policies?.refundable?.cancellationRefund === "REFUNDABLE_UP_TO_DEADLINE";
  const deadline = o.policies?.cancellations?.find((c) => c.deadline)?.deadline ?? null;
  const stillFree = refundable && (!deadline || Date.parse(deadline) > Date.now());
  const est = o.room?.typeEstimated;
  const km = meta.hotel.distance;

  return {
    id: raw.hotel.hotelId, // service prefixes the searchId
    hotelId: raw.hotel.hotelId,
    name: titleCase(raw.hotel.name),
    stars: meta.stars,
    rating: null,
    location: {
      lat: raw.hotel.latitude ?? meta.hotel.geoCode?.latitude ?? 0,
      lon: raw.hotel.longitude ?? meta.hotel.geoCode?.longitude ?? 0,
    },
    distanceKm: km ? Math.round((km.unit === "MILE" ? km.value * 1.609 : km.value) * 10) / 10 : null,
    city: raw.hotel.cityCode ?? meta.hotel.iataCode ?? null,
    countryCode: meta.hotel.address?.countryCode ?? null,
    room: {
      offerId: o.id,
      type: est?.category ? titleCase(est.category.replace(/_/g, " ")) : "Room",
      description: o.room?.description?.text ?? null,
      beds: est?.beds ? `${est.beds} ${est.bedType ? titleCase(est.bedType) : "bed"}${est.beds > 1 ? "s" : ""}` : null,
    },
    boardType: o.boardType ? titleCase(o.boardType.replace(/_/g, " ")) : null,
    nights: ctx.nights,
    price: {
      totalMinor,
      perNightMinor: Math.round(totalMinor / Math.max(1, ctx.nights)),
      currency: o.price.currency,
    },
    cancellation: { free: stillFree, freeUntil: stillFree ? deadline : null },
    checkIn: o.checkInDate,
    checkOut: o.checkOutDate,
  };
}

const fractionDigits = (currency: string) =>
  new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
const titleCase = (s: string) => s.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());
