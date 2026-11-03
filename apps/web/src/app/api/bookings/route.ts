import { NextResponse, type NextRequest } from "next/server";
import { createBookingSchema } from "@fh/domain/booking";
import { BookingError, createBooking } from "@fh/api/booking";
import { apiError, limit } from "@/lib/api";
import { getUserId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS: Record<BookingError["code"], number> = {
  OFFER_EXPIRED: 410,
  PRICE_CHANGED: 409,
  PASSENGER_MISMATCH: 422,
  CURRENCY_MISMATCH: 422,
  HOTEL_DATES_MISMATCH: 422,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
};

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return apiError(401, "UNAUTHENTICATED", "Please sign in to book.");
  const limited = await limit(req, "booking", 5, 60, userId);
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const parsed = createBookingSchema.safeParse(body);
  if (!parsed.success)
    return apiError(400, "INVALID_REQUEST", "Please check the booking details.", { issues: parsed.error.flatten().fieldErrors });

  try {
    const { booking, created } = await createBooking(userId, parsed.data);
    return NextResponse.json({ data: booking }, { status: created ? 201 : 200 });
  } catch (err) {
    if (err instanceof BookingError) return apiError(STATUS[err.code], err.code, err.message, { details: err.details });
    console.error("[bookings] unexpected", err);
    return apiError(500, "INTERNAL", "We couldn't complete your booking. You have not been charged.");
  }
}
