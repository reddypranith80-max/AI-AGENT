import { prisma } from "@fh/db";

/**
 * Reference-data safety net. Real rows come from `pnpm --filter @fh/db seed:reference`; this only
 * inserts minimal placeholders for codes the seed doesn't know, so FKs never block a booking/track.
 * Placeholders use countryCode "ZZ" and 0/0 coordinates; the UI treats them as "unknown".
 */
export const PLACEHOLDER_COUNTRY = "ZZ";

export async function ensureAirports(iatas: string[]) {
  const unique = [...new Set(iatas.filter(Boolean))];
  if (unique.length === 0) return;
  await prisma.airport.createMany({
    data: unique.map((iata) => ({
      iata,
      name: iata,
      city: iata,
      countryCode: PLACEHOLDER_COUNTRY,
      latitude: 0,
      longitude: 0,
      timezone: "UTC",
    })),
    skipDuplicates: true,
  });
}

export async function ensureAirlines(airlines: { iata: string; name?: string }[]) {
  const byCode = new Map(airlines.filter((a) => a.iata).map((a) => [a.iata, a.name ?? a.iata]));
  if (byCode.size === 0) return;
  await prisma.airline.createMany({
    data: [...byCode].map(([iata, name]) => ({ iata, name })),
    skipDuplicates: true,
  });
}

export const isPlaceholderAirport = (a: { countryCode: string }) => a.countryCode === PLACEHOLDER_COUNTRY;
