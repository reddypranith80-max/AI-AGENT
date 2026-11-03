import { randomInt } from "node:crypto";
import { prisma, Prisma } from "@fh/db";
import type { BookingErrorCode, BookingResult, CreateBookingInput, PassengerInput, TripDto } from "@fh/domain/booking";
import { zonedToUtc } from "@fh/domain/time";
import { encryptPii } from "./crypto";
import { emit } from "./events";
import { getFlightOffer } from "./flights";
import { getHotelOffer } from "./hotels";
import "./notify"; // registers event handlers for the in-process (no-Redis) mode
import { ensureAirlines, ensureAirports } from "./reference";
import { ensureInstanceFromSchedule } from "./tracking";

export class BookingError extends Error {
  constructor(
    readonly code: BookingErrorCode | "NOT_FOUND" | "FORBIDDEN",
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "BookingError";
  }
}

/** "stripe" leaves the booking PENDING until the payment webhook calls confirmBooking(); anything else confirms immediately. */
const autoConfirm = () => (process.env.PAYMENT_MODE ?? "mock") !== "stripe";
const HOLD_MINUTES = 30;

const REF_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L
const newReference = () => "FH-" + Array.from({ length: 6 }, () => REF_ALPHABET[randomInt(REF_ALPHABET.length)]).join("");

const toResult = (b: { id: string; reference: string; status: BookingResult["status"]; totalMinor: bigint; currency: string; type: BookingResult["type"] }): BookingResult => ({
  id: b.id, reference: b.reference, status: b.status, totalMinor: Number(b.totalMinor), currency: b.currency, type: b.type,
});

function passengerSnapshot(p: PassengerInput) {
  const { passport, ...rest } = p;
  return { ...rest, passport: passport ? { numberEnc: encryptPii(passport.number), last4: passport.number.slice(-4), expiry: passport.expiry, issuingCountry: passport.issuingCountry } : undefined };
}

/**
 * Creates a flight (+ optional hotel) booking in ONE database transaction: booking, per-direction
 * flight rows, segments (linked to shared FlightInstances), hotel stay, travellers and the audit event
 * either all exist or none do. The hotel row hangs off the same `booking.id`, which is the link.
 *
 * Idempotent on `idempotencyKey`. Offers are read from the search caches; if they expired the user
 * must search again (OFFER_EXPIRED). The total the user saw must match, otherwise PRICE_CHANGED.
 */
export async function createBooking(userId: string, input: CreateBookingInput): Promise<{ booking: BookingResult; created: boolean }> {
  const dup = await prisma.booking.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (dup) {
    if (dup.userId !== userId) throw new BookingError("FORBIDDEN", "Idempotency key already used");
    return { booking: toResult(dup), created: false };
  }

  const flight = await getFlightOffer(input.flightOfferId);
  if (!flight) throw new BookingError("OFFER_EXPIRED", "This flight offer has expired. Please search again.");
  const hotel = input.hotelOfferId ? await getHotelOffer(input.hotelOfferId) : null;
  if (input.hotelOfferId && !hotel) throw new BookingError("OFFER_EXPIRED", "This hotel offer has expired. Please search again.");

  // Party must match what the fare was priced for.
  const count = (t: string) => input.passengers.filter((p) => p.type === t).length;
  const party = { adults: count("ADULT"), children: count("CHILD"), infants: count("INFANT") };
  if (party.adults !== flight.travelers.adults || party.children !== flight.travelers.children || party.infants !== flight.travelers.infants)
    throw new BookingError("PASSENGER_MISMATCH", "Travellers don't match the searched party.", { expected: flight.travelers, got: party });

  if (hotel && hotel.price.currency !== flight.price.currency)
    throw new BookingError("CURRENCY_MISMATCH", "Flight and hotel must be priced in the same currency.");
  if (hotel) {
    const arrive = flight.slices[0].arriveLocal.slice(0, 10);
    if (hotel.checkIn < new Date(Date.parse(arrive) - 86_400_000).toISOString().slice(0, 10))
      throw new BookingError("HOTEL_DATES_MISMATCH", "Hotel check-in is before your flight arrives.");
  }

  const totalMinor = flight.price.totalMinor + (hotel?.price.totalMinor ?? 0);
  const currency = flight.price.currency;
  if (input.expectedTotal.currency !== currency || input.expectedTotal.amountMinor !== totalMinor)
    throw new BookingError("PRICE_CHANGED", "The price has changed.", { total: { amountMinor: totalMinor, currency } });

  // Reference data (placeholders only if the seed hasn't run).
  const segs = flight.slices.flatMap((s) => s.segments);
  await ensureAirlines(segs.map((s) => ({ iata: s.carrier.code, name: s.carrier.name })));
  await ensureAirports(segs.flatMap((s) => [s.origin.iata, s.destination.iata]));
  const airports = new Map((await prisma.airport.findMany({ where: { iata: { in: segs.flatMap((s) => [s.origin.iata, s.destination.iata]) } } })).map((a) => [a.iata, a]));

  const expiresAt = new Date(Date.now() + HOLD_MINUTES * 60_000);

  for (let attempt = 0; ; attempt++) {
    try {
      const booking = await prisma.$transaction(async (tx) => {
        const b = await tx.booking.create({
          data: {
            reference: newReference(),
            userId,
            type: hotel ? "FLIGHT_HOTEL" : "FLIGHT",
            status: "PENDING",
            totalMinor: BigInt(totalMinor),
            currency,
            contactEmail: input.contact.email,
            contactPhone: input.contact.phone,
            idempotencyKey: input.idempotencyKey,
            expiresAt,
          },
        });

        // Flights: one row per direction; segments link to shared FlightInstances for live tracking.
        for (const [i, slice] of flight.slices.entries()) {
          const bf = await tx.bookingFlight.create({
            data: {
              bookingId: b.id,
              provider: "amadeus",
              providerOrderId: `pending:${b.id}:${slice.direction}`, // replaced once the airline order is ticketed
              direction: slice.direction,
              // A round-trip fare isn't separable by leg: the full amount sits on the outbound row.
              totalMinor: BigInt(i === 0 ? flight.price.totalMinor : 0),
              currency,
            },
          });
          for (const [seq, s] of slice.segments.entries()) {
            const o = airports.get(s.origin.iata)!;
            const d = airports.get(s.destination.iata)!;
            const departAt = zonedToUtc(s.departLocal, o.timezone);
            const arriveAt = zonedToUtc(s.arriveLocal, d.timezone);
            const num = s.flightNumber.slice(s.carrier.code.length);
            const inst = await ensureInstanceFromSchedule(tx, {
              airlineIata: s.carrier.code, flightNumber: num,
              originIata: s.origin.iata, destinationIata: s.destination.iata,
              scheduledDepartAt: departAt, scheduledArriveAt: arriveAt,
            });
            await tx.flightSegment.create({
              data: {
                bookingFlightId: bf.id, seq, airlineIata: s.carrier.code, flightNumber: num,
                originIata: s.origin.iata, destinationIata: s.destination.iata,
                departAt, arriveAt, aircraft: s.aircraft, cabin: s.cabin, flightInstanceId: inst.id,
              },
            });
          }
        }

        if (hotel) {
          await tx.bookingHotel.create({
            data: {
              bookingId: b.id, // <- the link between the hotel stay and the flight booking
              provider: "amadeus",
              hotelId: hotel.hotelId,
              hotelName: hotel.name,
              latitude: hotel.location.lat,
              longitude: hotel.location.lon,
              checkIn: new Date(`${hotel.checkIn}T00:00:00Z`),
              checkOut: new Date(`${hotel.checkOut}T00:00:00Z`),
              rooms: 1,
              guests: input.passengers.length,
              roomType: hotel.room.type,
              totalMinor: BigInt(hotel.price.totalMinor),
              currency: hotel.price.currency,
              cancellationPolicy: hotel.cancellation as unknown as Prisma.InputJsonValue,
              freeCancellationUntil: hotel.cancellation.freeUntil ? new Date(hotel.cancellation.freeUntil) : null,
              raw: { offerId: hotel.room.offerId } as Prisma.InputJsonValue,
            },
          });
        }

        for (const p of input.passengers) {
          let passengerId: string | null = p.savedPassengerId ?? null;
          if (!passengerId && input.savePassengers) {
            const saved = await tx.passenger.create({
              data: {
                userId, firstName: p.firstName, lastName: p.lastName, dateOfBirth: new Date(`${p.dateOfBirth}T00:00:00Z`),
                gender: p.gender, nationality: p.nationality,
                passportNumberEnc: p.passport ? encryptPii(p.passport.number) : null,
                passportExpiry: p.passport ? new Date(`${p.passport.expiry}T00:00:00Z`) : null,
                passportCountry: p.passport?.issuingCountry,
              },
            });
            passengerId = saved.id;
          }
          await tx.bookingPassenger.create({
            data: { bookingId: b.id, passengerId, type: p.type, snapshot: passengerSnapshot(p) as unknown as Prisma.InputJsonValue },
          });
        }

        await tx.bookingEvent.create({
          data: { bookingId: b.id, type: "created", payload: { flightOfferId: input.flightOfferId, hotelOfferId: input.hotelOfferId ?? null, totalMinor } },
        });
        return b;
      });

      if (autoConfirm()) await confirmBooking(booking.id);
      const fresh = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
      return { booking: toResult(fresh), created: true };
    } catch (e) {
      // Reference collision (1 in ~887M) or a concurrent request with the same idempotency key.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const winner = await prisma.booking.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
        if (winner) return { booking: toResult(winner), created: false };
        if (attempt < 2) continue;
      }
      throw e;
    }
  }
}

/**
 * PENDING → CONFIRMED (called directly in mock-payment mode, or by the Stripe webhook).
 * Subscribes the traveller to live status for every segment and emits `booking.created`
 * (which sends the confirmation email and schedules check-in reminders).
 */
export async function confirmBooking(bookingId: string) {
  const flipped = await prisma.booking.updateMany({
    where: { id: bookingId, status: "PENDING" },
    data: { status: "CONFIRMED", expiresAt: null },
  });
  if (flipped.count === 0) return false; // already confirmed (webhook retry) or no longer pending

  const b = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { flights: { include: { segments: true } } },
  });
  await prisma.$transaction([
    prisma.bookingHotel.updateMany({ where: { bookingId, status: "PENDING" }, data: { status: "CONFIRMED" } }),
    prisma.bookingEvent.create({ data: { bookingId, type: "confirmed" } }),
    ...b.flights.flatMap((f) => f.segments).flatMap((s) =>
      s.flightInstanceId
        ? [prisma.flightSubscription.upsert({
            where: { userId_flightInstanceId: { userId: b.userId, flightInstanceId: s.flightInstanceId } },
            create: { userId: b.userId, flightInstanceId: s.flightInstanceId, bookingId },
            update: { bookingId },
          })]
        : [],
    ),
  ]);
  await emit("booking.created", { bookingId }, { jobId: `booking-created-${bookingId}` });
  return true;
}

/** Releases unpaid holds. Run by the worker; returns how many bookings expired. */
export async function expirePendingBookings() {
  const res = await prisma.booking.updateMany({
    where: { status: "PENDING", expiresAt: { lt: new Date() } },
    data: { status: "FAILED" },
  });
  return res.count;
}

// ───────────────────────────── read models ─────────────────────────────

const tripInclude = {
  passengers: true,
  hotels: true,
  flights: {
    orderBy: { direction: "asc" },
    include: {
      segments: { orderBy: { seq: "asc" }, include: { airline: true, origin: true, destination: true, flightInstance: true } },
    },
  },
} satisfies Prisma.BookingInclude;

type TripRow = Prisma.BookingGetPayload<{ include: typeof tripInclude }>;

function toTripDto(b: TripRow): TripDto {
  const allSegs = b.flights.flatMap((f) => f.segments).sort((x, y) => x.departAt.getTime() - y.departAt.getTime());
  const h = b.hotels[0];
  return {
    id: b.id,
    reference: b.reference,
    status: b.status,
    type: b.type,
    total: { amountMinor: Number(b.totalMinor), currency: b.currency },
    createdAt: b.createdAt.toISOString(),
    contactEmail: b.contactEmail,
    flights: b.flights.map((f) => ({
      direction: f.direction,
      pnr: f.pnr,
      segments: f.segments.map((s) => ({
        id: s.id,
        flightNumber: `${s.airlineIata}${s.flightNumber}`,
        airlineIata: s.airlineIata,
        airlineName: s.airline.name,
        from: { iata: s.originIata, city: s.origin.city, timezone: s.origin.timezone },
        to: { iata: s.destinationIata, city: s.destination.city, timezone: s.destination.timezone },
        departAt: s.departAt.toISOString(),
        arriveAt: s.arriveAt.toISOString(),
        cabin: s.cabin,
        flightInstanceId: s.flightInstanceId,
        flightStatus: s.flightInstance?.status ?? null,
      })),
    })),
    hotel: h
      ? {
          id: h.id, name: h.hotelName, address: h.address,
          checkIn: h.checkIn.toISOString().slice(0, 10), checkOut: h.checkOut.toISOString().slice(0, 10),
          nights: Math.round((h.checkOut.getTime() - h.checkIn.getTime()) / 86_400_000),
          roomType: h.roomType, rooms: h.rooms, guests: h.guests, status: h.status,
          freeCancellationUntil: h.freeCancellationUntil?.toISOString() ?? null,
          latitude: h.latitude, longitude: h.longitude,
        }
      : null,
    passengers: b.passengers.map((p) => {
      const s = p.snapshot as { firstName?: string; lastName?: string };
      return { name: `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim(), type: p.type, ticketNumber: p.ticketNumber };
    }),
    departsAt: allSegs[0]?.departAt.toISOString() ?? b.createdAt.toISOString(),
    arrivesAt: allSegs[allSegs.length - 1]?.arriveAt.toISOString() ?? b.createdAt.toISOString(),
  };
}

export async function getTrip(userId: string, bookingId: string): Promise<TripDto | null> {
  const b = await prisma.booking.findFirst({ where: { id: bookingId, userId, deletedAt: null }, include: tripInclude });
  return b ? toTripDto(b) : null;
}

export async function listTrips(userId: string): Promise<{ upcoming: TripDto[]; past: TripDto[] }> {
  const rows = await prisma.booking.findMany({
    where: { userId, deletedAt: null, status: { in: ["CONFIRMED", "TICKETED", "PENDING", "CANCELLED", "REFUNDED"] } },
    include: tripInclude,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const trips = rows.map(toTripDto);
  const now = Date.now();
  const isPast = (t: TripDto) => Date.parse(t.arrivesAt) < now || t.status === "CANCELLED" || t.status === "REFUNDED";
  return {
    upcoming: trips.filter((t) => !isPast(t)).sort((a, b) => Date.parse(a.departsAt) - Date.parse(b.departsAt)),
    past: trips.filter(isPast).sort((a, b) => Date.parse(b.departsAt) - Date.parse(a.departsAt)),
  };
}
