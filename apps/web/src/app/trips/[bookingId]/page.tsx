import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ArrowLeft, CheckCircle2, Hotel, Plane, Users } from "lucide-react";
import { getTrip } from "@fh/api/booking";
import { FlightTracker } from "@/components/tracking/flight-tracker";
import { TripStatusBadge } from "@/components/trips/trip-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cabinLabel, clock, dateOnly, dayLabel, formatMoney } from "@/lib/format";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Trip details" };
export const dynamic = "force-dynamic";

export default async function TripPage({ params, searchParams }: { params: Promise<{ bookingId: string }>; searchParams: Promise<{ new?: string }> }) {
  const { bookingId } = await params;
  const { new: isNew } = await searchParams;
  const userId = await requireUser(`/trips/${bookingId}`);
  if (!z.string().uuid().safeParse(bookingId).success) notFound();

  const trip = await getTrip(userId, bookingId);
  if (!trip) notFound();

  const active = trip.status === "CONFIRMED" || trip.status === "TICKETED";
  // Offer live tracking from booking until a day after arrival.
  const showTracker = active && Date.parse(trip.arrivesAt) + 24 * 3_600_000 > Date.now();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2"><Link href="/trips"><ArrowLeft /> All trips</Link></Button>

      {isNew && (
        <Alert variant="success">
          <AlertTitle className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> You're booked!</AlertTitle>
          <AlertDescription>A confirmation is on its way to {trip.contactEmail}. We'll email you about delays and gate changes.</AlertDescription>
        </Alert>
      )}

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Booking reference</p>
          <h1 className="text-2xl font-bold tracking-tight">{trip.reference}</h1>
        </div>
        <div className="flex items-center gap-3">
          <TripStatusBadge status={trip.status} />
          <p className="text-lg font-semibold tabular-nums">{formatMoney(trip.total.amountMinor, trip.total.currency)}</p>
        </div>
      </header>

      {trip.flights.map((f) => (
        <Card key={f.direction}>
          <CardHeader><CardTitle className="flex items-center gap-2"><Plane className="h-4 w-4" />{f.direction === "OUTBOUND" ? "Outbound" : "Return"}{f.pnr && <span className="text-sm font-normal text-muted-foreground">· PNR {f.pnr}</span>}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {f.segments.map((s) => (
              <div key={s.id} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <div>
                  <p className="text-xl font-bold tracking-wide">{s.from.iata}</p>
                  <p className="text-sm font-semibold tabular-nums">{clock(s.departAt, s.from.timezone)}</p>
                  <p className="text-xs text-muted-foreground">{dayLabel(s.departAt, s.from.timezone)}</p>
                </div>
                <div className="text-center text-xs text-muted-foreground">
                  <Plane className="mx-auto h-4 w-4 rotate-90" aria-hidden />
                  <p className="mt-1 font-medium text-foreground">{s.flightNumber}</p>
                  <p>{cabinLabel(s.cabin)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold tracking-wide">{s.to.iata}</p>
                  <p className="text-sm font-semibold tabular-nums">{clock(s.arriveAt, s.to.timezone)}</p>
                  <p className="text-xs text-muted-foreground">{dayLabel(s.arriveAt, s.to.timezone)}</p>
                </div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">{[...new Set(f.segments.map((s) => s.airlineName))].join(" · ")} · times shown in each airport's local time</p>
          </CardContent>
        </Card>
      ))}

      {trip.hotel && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Hotel className="h-4 w-4" />{trip.hotel.name}</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>{dateOnly(trip.hotel.checkIn)} → {dateOnly(trip.hotel.checkOut)} · {trip.hotel.nights} night{trip.hotel.nights > 1 ? "s" : ""}</p>
            <p className="text-muted-foreground">{[trip.hotel.roomType, `${trip.hotel.guests} guest${trip.hotel.guests > 1 ? "s" : ""}`].filter(Boolean).join(" · ")}</p>
            {trip.hotel.freeCancellationUntil && <p className="text-success">Free cancellation until {dateOnly(trip.hotel.freeCancellationUntil.slice(0, 10))}</p>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-4 w-4" />Travellers</CardTitle></CardHeader>
        <CardContent>
          <ul className="divide-y text-sm">
            {trip.passengers.map((p, i) => (
              <li key={i} className="flex justify-between py-2"><span>{p.name}</span><span className="text-muted-foreground">{p.ticketNumber ?? p.type.toLowerCase()}</span></li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {showTracker && (
        <div id="track" className="scroll-mt-20">
          <FlightTracker trackingId={trip.id} />
        </div>
      )}
    </div>
  );
}
