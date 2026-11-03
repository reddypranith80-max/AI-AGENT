"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { Controller, useFieldArray, useForm, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { Briefcase, Hotel, Lock, Plane } from "lucide-react";
import { contactSchema, passengerInputSchema, type BookingResult, type CreateBookingInput } from "@fh/domain/booking";
import { isRealDate } from "@fh/domain/flights";
import { EmptyState } from "@/components/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTrip } from "@/hooks/use-trip";
import { ApiClientError, fetchJson } from "@/lib/client";
import { dateOnly, formatMoney, localClock, localDay, stopsLabel } from "@/lib/format";

// Passport is optional in the form (flat fields); all-or-nothing, mapped to the API's nested shape on submit.
const paxForm = passengerInputSchema.omit({ passport: true, nationality: true }).extend({
  passportNumber: z.string().trim().optional(),
  passportExpiry: z.string().optional(),
  passportCountry: z.string().trim().toUpperCase().optional(),
});
const formSchema = z
  .object({
    passengers: z.array(paxForm).min(1),
    contact: contactSchema,
    acceptedTerms: z.literal(true, { errorMap: () => ({ message: "Please accept the terms to continue" }) }),
    savePassengers: z.boolean(),
  })
  .superRefine((v, ctx) => {
    v.passengers.forEach((p, i) => {
      const any = p.passportNumber || p.passportExpiry || p.passportCountry;
      if (!any) return;
      const add = (k: string, message: string) => ctx.addIssue({ code: "custom", path: ["passengers", i, k], message });
      if (!p.passportNumber || !/^[A-Z0-9]{5,20}$/i.test(p.passportNumber)) add("passportNumber", "5–20 letters or digits");
      if (!p.passportExpiry || !isRealDate(p.passportExpiry) || p.passportExpiry < new Date().toISOString().slice(0, 10)) add("passportExpiry", "Enter a future expiry date");
      if (!p.passportCountry || !/^[A-Z]{2}$/.test(p.passportCountry)) add("passportCountry", "2-letter country code");
    });
  });
type FormValues = z.infer<typeof formSchema>;

const TYPE_LABEL = { ADULT: "Adult", CHILD: "Child", INFANT: "Infant" } as const;

export function BookingFlow({ defaultEmail }: { defaultEmail: string }) {
  const router = useRouter();
  const { trip, clear, totalMinor, currency } = useTrip();
  const idempotencyKey = useRef<string>(crypto.randomUUID()); // one key per checkout attempt → safe double-click / retry
  const [serverError, setServerError] = useState<ApiClientError | null>(null);
  const [invalidCount, setInvalidCount] = useState(0);

  const defaultPassengers = useMemo(() => {
    const t = trip.flight?.travelers;
    if (!t) return [];
    const blank = (type: "ADULT" | "CHILD" | "INFANT") => ({
      type, firstName: "", lastName: "", dateOfBirth: "", gender: "UNSPECIFIED" as const,
      passportNumber: "", passportExpiry: "", passportCountry: "",
    });
    return [
      ...Array.from({ length: t.adults }, () => blank("ADULT")),
      ...Array.from({ length: t.children }, () => blank("CHILD")),
      ...Array.from({ length: t.infants }, () => blank("INFANT")),
    ];
  }, [trip.flight?.travelers]);

  const { control, register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { passengers: defaultPassengers, contact: { email: defaultEmail, phone: "" }, acceptedTerms: undefined as never, savePassengers: false },
  });
  const { fields } = useFieldArray({ control, name: "passengers" });

  const book = useMutation<{ data: BookingResult }, ApiClientError, CreateBookingInput>({
    mutationFn: (body) => fetchJson("/api/bookings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });

  if (!trip.flight) {
    return (
      <div className="mx-auto max-w-xl">
        <EmptyState icon={<Plane className="h-5 w-5" />} title="Nothing to book yet" action={<Button asChild><Link href="/">Search flights</Link></Button>}>
          Pick a flight (and optionally a hotel) and it will show up here.
        </EmptyState>
      </div>
    );
  }
  const flight = trip.flight;
  const hotel = trip.hotel;

  async function onSubmit(v: FormValues) {
    setServerError(null);
    const body: CreateBookingInput = {
      idempotencyKey: idempotencyKey.current,
      flightOfferId: flight.id,
      hotelOfferId: hotel?.id,
      passengers: v.passengers.map(({ passportNumber, passportExpiry, passportCountry, ...p }) => ({
        ...p,
        nationality: passportCountry || undefined, // issuing country is the best nationality hint we collect
        passport: passportNumber ? { number: passportNumber, expiry: passportExpiry!, issuingCountry: passportCountry! } : undefined,
      })),
      contact: v.contact,
      expectedTotal: { amountMinor: totalMinor, currency: currency! },
      acceptedTerms: true,
      savePassengers: v.savePassengers,
    };
    try {
      const res = await book.mutateAsync(body);
      clear();
      router.push(`/trips/${res.data.id}?new=1`);
    } catch (e) {
      const err = e as ApiClientError;
      setServerError(err);
      // Server-side field issues (e.g. "passengers.0.firstName") are mapped back onto the form.
      for (const [path, msgs] of Object.entries(err.issues ?? {})) if (msgs?.[0]) setError(path as never, { message: msgs[0] });
      if (err.code !== "OFFER_EXPIRED" && err.code !== "PRICE_CHANGED") idempotencyKey.current = crypto.randomUUID(); // failed attempts may be retried fresh
    }
  }

  const pe = (errors.passengers ?? []) as FieldErrors<FormValues["passengers"][number]>[];
  const expired = serverError?.code === "OFFER_EXPIRED" || serverError?.code === "PRICE_CHANGED";

  return (
    <form onSubmit={handleSubmit(onSubmit, (errs) => setInvalidCount(countErrors(errs)))} noValidate className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        <h1 className="text-2xl font-bold tracking-tight">Passenger details</h1>

        {invalidCount > 0 && Object.keys(errors).length > 0 && (
          <Alert variant="destructive" role="alert">
            <AlertTitle>Please fix {invalidCount} field{invalidCount > 1 ? "s" : ""} below</AlertTitle>
            <AlertDescription>Highlighted fields need your attention before we can book.</AlertDescription>
          </Alert>
        )}

        {serverError && (
          <Alert variant={expired ? "warning" : "destructive"}>
            <AlertTitle>{expired ? (serverError.code === "PRICE_CHANGED" ? "The price changed" : "This offer expired") : "Booking failed"}</AlertTitle>
            <AlertDescription>
              {serverError.message}
              {expired && (
                <span className="mt-2 block">
                  <Button asChild size="sm" variant="outline"><Link href={flight && trip.flightQuery ? `/flights?${trip.flightQuery}` : "/"}>Search again</Link></Button>
                </span>
              )}
            </AlertDescription>
          </Alert>
        )}

        {fields.map((f, i) => (
          <Card key={f.id}>
            <CardHeader><CardTitle>Traveller {i + 1} · {TYPE_LABEL[f.type]}</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field id={`p${i}-first`} label="First name (as on passport)" error={pe[i]?.firstName?.message}>
                <Input id={`p${i}-first`} autoComplete="given-name" aria-invalid={!!pe[i]?.firstName} {...register(`passengers.${i}.firstName`)} />
              </Field>
              <Field id={`p${i}-last`} label="Last name" error={pe[i]?.lastName?.message}>
                <Input id={`p${i}-last`} autoComplete="family-name" aria-invalid={!!pe[i]?.lastName} {...register(`passengers.${i}.lastName`)} />
              </Field>
              <Field id={`p${i}-dob`} label="Date of birth" error={pe[i]?.dateOfBirth?.message}>
                <Input id={`p${i}-dob`} type="date" autoComplete="bday" aria-invalid={!!pe[i]?.dateOfBirth} {...register(`passengers.${i}.dateOfBirth`)} />
              </Field>
              <Field id={`p${i}-gender`} label="Gender" error={pe[i]?.gender?.message}>
                <Controller control={control} name={`passengers.${i}.gender`} render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id={`p${i}-gender`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FEMALE">Female</SelectItem>
                      <SelectItem value="MALE">Male</SelectItem>
                      <SelectItem value="UNSPECIFIED">Prefer not to say</SelectItem>
                    </SelectContent>
                  </Select>
                )} />
              </Field>

              <details className="sm:col-span-2 rounded-lg border px-3 py-2">
                <summary className="cursor-pointer text-sm font-medium">Passport details <span className="font-normal text-muted-foreground">(needed for international flights)</span></summary>
                <div className="mt-3 grid gap-4 sm:grid-cols-3">
                  <Field id={`p${i}-pn`} label="Passport number" error={pe[i]?.passportNumber?.message}>
                    <Input id={`p${i}-pn`} autoCapitalize="characters" autoComplete="off" {...register(`passengers.${i}.passportNumber`)} />
                  </Field>
                  <Field id={`p${i}-pe`} label="Expiry" error={pe[i]?.passportExpiry?.message}>
                    <Input id={`p${i}-pe`} type="date" {...register(`passengers.${i}.passportExpiry`)} />
                  </Field>
                  <Field id={`p${i}-pc`} label="Issuing country" error={pe[i]?.passportCountry?.message}>
                    <Input id={`p${i}-pc`} maxLength={2} placeholder="GB" autoCapitalize="characters" {...register(`passengers.${i}.passportCountry`)} />
                  </Field>
                </div>
              </details>
            </CardContent>
          </Card>
        ))}

        <Card>
          <CardHeader><CardTitle>Contact</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field id="email" label="Email (we'll send your itinerary here)" error={errors.contact?.email?.message}>
              <Input id="email" type="email" autoComplete="email" inputMode="email" aria-invalid={!!errors.contact?.email} {...register("contact.email")} />
            </Field>
            <Field id="phone" label="Mobile (for flight alerts)" error={errors.contact?.phone?.message}>
              <Input id="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="+14155550123" aria-invalid={!!errors.contact?.phone} {...register("contact.phone")} />
            </Field>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <div className="flex items-start gap-2">
            <Controller control={control} name="savePassengers" render={({ field }) => (
              <Checkbox id="save" checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} className="mt-0.5" />
            )} />
            <Label htmlFor="save" className="font-normal">Save traveller details for next time (passport numbers are encrypted)</Label>
          </div>
          <div className="flex items-start gap-2">
            <Controller control={control} name="acceptedTerms" render={({ field }) => (
              <Checkbox id="terms" checked={field.value === true} onCheckedChange={(c) => field.onChange(c === true ? true : undefined)} className="mt-0.5" aria-describedby={errors.acceptedTerms ? "terms-error" : undefined} />
            )} />
            <Label htmlFor="terms" className="font-normal">I agree to the fare rules, terms and privacy policy.</Label>
          </div>
          {errors.acceptedTerms && <p id="terms-error" role="alert" className="text-xs text-destructive">{errors.acceptedTerms.message}</p>}
        </div>
      </div>

      {/* Summary */}
      <aside className="lg:sticky lg:top-20 lg:self-start" aria-label="Trip summary">
        <Card>
          <CardHeader><CardTitle>Your trip</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {flight.slices.map((s) => (
              <div key={s.direction} className="space-y-0.5 text-sm">
                <p className="flex items-center gap-1.5 font-medium"><Plane className="h-3.5 w-3.5 rotate-45 text-muted-foreground" />{s.origin} → {s.destination}</p>
                <p className="text-muted-foreground">{localDay(s.departLocal)} · {localClock(s.departLocal)}–{localClock(s.arriveLocal)} · {stopsLabel(s.stops)}</p>
              </div>
            ))}
            {hotel && (
              <div className="space-y-0.5 border-t pt-3 text-sm">
                <p className="flex items-center gap-1.5 font-medium"><Hotel className="h-3.5 w-3.5 text-muted-foreground" />{hotel.name}</p>
                <p className="text-muted-foreground">{dateOnly(hotel.checkIn)} – {dateOnly(hotel.checkOut)} · {hotel.nights} night{hotel.nights > 1 ? "s" : ""}</p>
                <Link href={`/hotels?${new URLSearchParams({ loc: `iata:${flight.slices[0].destination}`, checkIn: hotel.checkIn, checkOut: hotel.checkOut })}`} className="text-xs text-primary underline">Change hotel</Link>
              </div>
            )}
            {!hotel && (
              <Button asChild variant="outline" size="sm" className="w-full"><Link href={`/flights/${encodeURIComponent(flight.id)}`}><Hotel /> Add a hotel</Link></Button>
            )}

            <dl className="space-y-1.5 border-t pt-3 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Flights</dt><dd className="tabular-nums">{formatMoney(flight.price.totalMinor, flight.price.currency)}</dd></div>
              {hotel && <div className="flex justify-between"><dt className="text-muted-foreground">Hotel</dt><dd className="tabular-nums">{formatMoney(hotel.price.totalMinor, hotel.price.currency)}</dd></div>}
              <div className="flex justify-between border-t pt-2 text-base font-bold"><dt>Total</dt><dd className="tabular-nums">{formatMoney(totalMinor, currency!)}</dd></div>
            </dl>
            {flight.checkedBags !== null && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Briefcase className="h-3.5 w-3.5" />{flight.checkedBags > 0 ? `${flight.checkedBags} checked bag included` : "No checked bag included"}</p>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={isSubmitting || book.isPending || expired}>
              <Lock /> {isSubmitting || book.isPending ? "Booking…" : "Confirm booking"}
            </Button>
            {process.env.NEXT_PUBLIC_PAYMENT_MODE !== "stripe" && (
              <p className="text-center text-xs text-muted-foreground">Demo checkout: no card is charged.</p>
            )}
          </CardContent>
        </Card>
      </aside>
    </form>
  );
}

/** Counts leaf errors in react-hook-form's nested error object (arrays and objects). */
function countErrors(e: unknown): number {
  if (!e || typeof e !== "object") return 0;
  if ("message" in e && typeof (e as { message: unknown }).message === "string") return 1;
  return Object.values(e as object).reduce<number>((n, v) => n + countErrors(v), 0);
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
