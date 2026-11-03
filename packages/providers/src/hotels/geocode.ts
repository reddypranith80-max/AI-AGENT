import { ProviderError, httpJson } from "../errors";

export type GeoPoint = { lat: number; lon: number; label: string };

/** Resolves a free-text city name to coordinates (Mapbox Geocoding). */
export async function geocodeCity(name: string, signal?: AbortSignal): Promise<GeoPoint> {
  const token = process.env.MAPBOX_TOKEN ?? process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token)
    throw new ProviderError("bad_request", "City-name search needs a geocoder; use an airport/city code instead");

  type Resp = { features?: { center: [number, number]; place_name: string }[] };
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(name)}.json` +
    `?types=place,locality&limit=1&access_token=${token}`;
  const json = await httpJson<Resp>(url, {}, { timeoutMs: 5_000, signal, vendor: "Mapbox" });
  const f = json.features?.[0];
  if (!f) throw new ProviderError("bad_request", `Couldn't find "${name}"`);
  return { lon: f.center[0], lat: f.center[1], label: f.place_name };
}
