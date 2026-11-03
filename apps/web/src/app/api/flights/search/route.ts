import { NextResponse, type NextRequest } from "next/server";
import { parseFlightSearchQuery } from "@fh/domain/flights";
import { searchFlights } from "@fh/api/flights";
import { apiError, limit, providerFailure } from "@/lib/api";

export const runtime = "nodejs"; // ioredis needs TCP
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = await limit(req, "flights", 30, 60);
  if (limited) return limited;

  const parsed = parseFlightSearchQuery(req.nextUrl.searchParams);
  if (!parsed.success)
    return apiError(400, "INVALID_REQUEST", "Please check your search details.", { issues: parsed.error.flatten().fieldErrors });

  try {
    const result = await searchFlights(parsed.data);
    return NextResponse.json(result, {
      // Results aren't user-specific, so the CDN may absorb repeat/shared searches.
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    });
  } catch (err) {
    return providerFailure(err, "flights");
  }
}
