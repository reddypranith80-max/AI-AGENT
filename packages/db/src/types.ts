import { Prisma } from "@prisma/client";

export { Prisma } from "@prisma/client";
export type {
  User, Passenger, Booking, BookingFlight, FlightSegment, BookingHotel, BookingPassenger,
  Payment, FlightInstance, FlightPosition, FlightStatusEvent, PriceWatch, Notification,
} from "@prisma/client";
export {
  TripType, CabinClass, BookingType, BookingStatus, HotelBookingStatus, PaymentStatus,
  FlightStatus, FlightStatusEventKind, NotificationType, NotificationChannel,
  NotificationStatus, PassengerType, FlightDirection,
} from "@prisma/client";

/** Booking with everything the trip-detail page renders. */
export const bookingWithDetails = Prisma.validator<Prisma.BookingDefaultArgs>()({
  include: {
    flights: {
      orderBy: { direction: "asc" },
      include: {
        segments: {
          orderBy: { seq: "asc" },
          include: { airline: true, origin: true, destination: true, flightInstance: true },
        },
      },
    },
    hotels: true,
    passengers: true,
    payments: true,
  },
});
export type BookingWithDetails = Prisma.BookingGetPayload<typeof bookingWithDetails>;

/** Live tracking view: one flight, latest position, recent events. */
export const flightTracking = Prisma.validator<Prisma.FlightInstanceDefaultArgs>()({
  include: {
    origin: true,
    destination: true,
    airline: true,
    positions: { orderBy: { recordedAt: "desc" }, take: 1 },
    events: { orderBy: { detectedAt: "desc" }, take: 10 },
  },
});
export type FlightTracking = Prisma.FlightInstanceGetPayload<typeof flightTracking>;
