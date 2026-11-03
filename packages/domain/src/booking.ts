import { z } from "zod";
import { isoDate } from "./flights";

const todayIso = () => new Date().toISOString().slice(0, 10);
const country = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/);
const currency = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/);
const minorUnits = z.number().int().positive().max(100_000_000);

export const PASSENGER_TYPES = ["ADULT", "CHILD", "INFANT"] as const;
export const GENDERS = ["MALE", "FEMALE", "UNSPECIFIED"] as const;

const namePart = z
  .string()
  .trim()
  .min(1, "Required")
  .max(40)
  .regex(/^[\p{L}][\p{L}\s'’-]*$/u, "Letters only, as printed on the passport");

export const passengerInputSchema = z.object({
  savedPassengerId: z.string().uuid().optional(),
  type: z.enum(PASSENGER_TYPES),
  firstName: namePart,
  lastName: namePart,
  dateOfBirth: isoDate.refine((d) => d < todayIso(), "Must be in the past"),
  gender: z.enum(GENDERS),
  nationality: country.optional(),
  passport: z
    .object({
      number: z.string().trim().min(5).max(20).regex(/^[A-Z0-9]+$/i, "Letters and digits only"),
      expiry: isoDate,
      issuingCountry: country,
    })
    .optional(), // required per-offer by the service layer when the route demands it
});
export type PassengerInput = z.infer<typeof passengerInputSchema>;

export const createBookingSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    flightOfferId: z.string().min(1),
    hotelOfferId: z.string().min(1).optional(),
    passengers: z.array(passengerInputSchema).min(1).max(9),
    contact: z.object({
      email: z.string().trim().toLowerCase().email().max(254),
      phone: z.string().regex(/^\+[1-9]\d{6,14}$/, "Use international format, e.g. +14155550123"),
    }),
    // The total the user saw; the server rejects the booking if the offers no longer add up to it.
    expectedTotal: z.object({ amountMinor: minorUnits, currency }),
    acceptedTerms: z.literal(true, { errorMap: () => ({ message: "You must accept the terms" }) }),
    savePassengers: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    const count = (t: string) => v.passengers.filter((p) => p.type === t).length;
    if (count("ADULT") < 1)
      ctx.addIssue({ code: "custom", path: ["passengers"], message: "At least one adult required" });
    if (count("INFANT") > count("ADULT"))
      ctx.addIssue({ code: "custom", path: ["passengers"], message: "One infant per adult" });
  });
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

/** Error codes the booking endpoint returns; the UI branches on these. */
export type BookingErrorCode =
  | "OFFER_EXPIRED"
  | "PRICE_CHANGED"
  | "PASSENGER_MISMATCH"
  | "CURRENCY_MISMATCH"
  | "HOTEL_DATES_MISMATCH";

export type BookingResult = {
  id: string;
  reference: string;
  status: "PENDING" | "CONFIRMED" | "TICKETED" | "CANCELLED" | "FAILED" | "REFUNDED";
  totalMinor: number;
  currency: string;
  type: "FLIGHT" | "FLIGHT_HOTEL";
};
