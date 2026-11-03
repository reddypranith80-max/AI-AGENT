import { NextResponse, type NextRequest } from "next/server";
import { HOTEL_SORTS, filterHotels, hotelFilterSchema, parseHotelSearchQuery, sortHotels, type HotelSort } from "@fh/domain/hotels";
import { searchHotels } from "@fh/api/hotels";
import { apiError, limit, providerFailure } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = await limit(req, "hotels", 30, 60);
  if (limited) return limited;

  const sp = req.nextUrl.searchParams;
  const parsed = parseHotelSearchQuery(sp);
  if (!parsed.success)
    return apiError(400, "INVALID_REQUEST", "Please check your search details.", { issues: parsed.error.flatten().fieldErrors });

  // Filters + sort never hit the provider; they're applied to the cached result set.
  const num = (k: string) => (sp.get(k) ? Number(sp.get(k)) : undefined);
  const filters = hotelFilterSchema.safeParse({
    minStars: num("fMinStars"),
    maxPricePerNightMinor: num("maxPrice"),
    minPricePerNightMinor: num("minPrice"),
    freeCancellation: sp.get("freeCancellation") === "true" ? true : undefined,
    minRating: num("minRating"),
  });
  if (!filters.success) return apiError(400, "INVALID_FILTERS", "Invalid filters.");
  const sortParam = sp.get("sort") as HotelSort | null;
  const sort = sortParam && (HOTEL_SORTS as readonly string[]).includes(sortParam) ? sortParam : "recommended";

  try {
    const result = await searchHotels(parsed.data);
    const data = sortHotels(filterHotels(result.data, filters.data), sort);
    return NextResponse.json(
      { data, meta: { ...result.meta, count: data.length, total: result.data.length } },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } },
    );
  } catch (err) {
    return providerFailure(err, "hotels");
  }
}
