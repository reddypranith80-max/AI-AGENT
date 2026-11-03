import { z } from "zod";
import { CABIN_CLASSES, TRIP_TYPES, iata, isoDate, isRealDate } from "./flights";

const todayIso = () => new Date().toISOString().slice(0, 10);

export const createPriceAlertSchema = z
  .object({
    tripType: z.enum(TRIP_TYPES),
    origin: iata,
    destination: iata,
    departDate: isoDate,
    returnDate: isoDate.optional(),
    cabin: z.enum(CABIN_CLASSES),
    adults: z.number().int().min(1).max(9),
    children: z.number().int().min(0).max(8),
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
    /** Alert when the lowest fare falls to or below this (minor units). */
    targetPriceMinor: z.number().int().positive().max(100_000_000).optional(),
    /** Alert when the lowest fare drops this % below the price at creation. */
    dropPercent: z.number().min(1).max(90).optional(),
  })
  .superRefine((v, ctx) => {
    const issue = (path: keyof typeof v, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    if (v.origin && v.origin === v.destination) issue("destination", "Origin and destination must differ");
    if (isRealDate(v.departDate) && v.departDate < todayIso()) issue("departDate", "Departure is in the past");
    if (v.tripType === "ROUND_TRIP" && (!v.returnDate || v.returnDate < v.departDate))
      issue("returnDate", "Valid return date required");
    if (v.tripType === "ONE_WAY" && v.returnDate) issue("returnDate", "Not allowed for one-way");
    if (v.targetPriceMinor === undefined && v.dropPercent === undefined)
      issue("targetPriceMinor", "Set a target price or a drop percentage");
    if (v.adults + v.children > 9) issue("adults", "Maximum 9 travellers");
  });
export type CreatePriceAlertInput = z.infer<typeof createPriceAlertSchema>;

export type PriceAlertView = {
  id: string;
  tripType: "ONE_WAY" | "ROUND_TRIP";
  origin: string;
  destination: string;
  departDate: string;
  returnDate: string | null;
  cabin: (typeof CABIN_CLASSES)[number];
  adults: number;
  children: number;
  currency: string;
  targetPriceMinor: number | null;
  dropPercent: number | null;
  baselineMinor: number | null;
  lastSeenMinor: number | null;
  lastCheckedAt: string | null;
  active: boolean;
  expiresAt: string;
};
