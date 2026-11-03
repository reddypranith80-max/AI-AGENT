import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { trackByFlightSchema } from "@fh/domain/tracking";
import { TrackingError, getTrackedFlightView, trackBooking, trackFlight } from "@fh/api/tracking";
import { apiError, limit } from "@/lib/api";
import { getUserId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.union([trackByFlightSchema, z.object({ bookingId: z.string().uuid() })]);

const TRACKING_STATUS = { NOT_FOUND: 404, BAD_IDENT: 400, FORBIDDEN: 403, UPSTREAM: 502 } as const;

/** Start tracking by flight number + date, or by booking id. Returns the flight(s) to stream. */
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return apiError(401, "UNAUTHENTICATED", "Please sign in to track flights.");
  const limited = await limit(req, "track", 20, 60, userId);
  if (limited) return limited;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "INVALID_REQUEST", "Enter a flight number like BA100 and a date.", { issues: parsed.error.flatten().fieldErrors });

  try {
    if ("bookingId" in parsed.data) {
      const segs = await trackBooking(userId, parsed.data.bookingId);
      return NextResponse.json({ data: { flights: segs.map((s) => ({ flightInstanceId: s.flightInstanceId, flightNumber: s.flightNumber })) } });
    }
    const flightInstanceId = await trackFlight(userId, parsed.data);
    const view = await getTrackedFlightView(flightInstanceId);
    return NextResponse.json({ data: { flights: [{ flightInstanceId, flightNumber: view.flightNumber }] } });
  } catch (err) {
    if (err instanceof TrackingError) return apiError(TRACKING_STATUS[err.code], err.code, err.message);
    console.error("[track] unexpected", err);
    return apiError(500, "INTERNAL", "Something went wrong.");
  }
}
