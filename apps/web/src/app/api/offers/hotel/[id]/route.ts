import { NextResponse, type NextRequest } from "next/server";
import { getHotelOffer } from "@fh/api/hotels";
import { apiError, limit } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const limited = await limit(req, "offer", 120, 60);
  if (limited) return limited;
  const { id } = await ctx.params;
  const offer = await getHotelOffer(decodeURIComponent(id));
  if (!offer) return apiError(410, "OFFER_EXPIRED", "This offer has expired. Please search again.");
  return NextResponse.json({ data: offer }, { headers: { "Cache-Control": "no-store" } });
}
