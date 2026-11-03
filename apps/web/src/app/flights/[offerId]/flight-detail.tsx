"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Briefcase, Clock, Hotel, Plane } from "lucide-react";
import type { FlightOffer, FlightSlice } from "@fh/domain/flights";
import { hotelSearchFromFlight, hotelSearchToQuery } from "@fh/domain/hotels";
import { ErrorState } from "@/components/states";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useTrip } from "@/hooks/use-trip";
import { ApiClientError, fetchJson } from "@/lib/client";
import { cabinLabel, formatDuration, formatMoney, localClock, localDay, stopsLabel } from "@/lib/format";

/** Layover between two segments at the same airport: both times are local to that airport, so subtracting is exact. */
const layoverMin = (arriveLocal: string, departLocal: string) => Math.round((Date.parse(`${departLocal}Z`) - Date.parse(`${arriveLocal}Z`)) / 60_000);

function SliceDetail({ slice }: { slice: FlightSlice }) {
  return (
    <Card>
      <div className="p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">
            {slice.direction === "OUTBOUND" ? "Outbound" : "Return"} · {localDay(slice.departLocal)}
          </h2>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><Clock className="h-3.5 w-3.5" />{formatDuration(slice.durationMin)} · {stopsLabel(slice.stops)}</p>
        </div>

        <ol className="space-y-0">
          {slice.segments.map((s, i) => {
            const next = slice.segments[i + 1];
            return (
              <li key={s.flightNumber + s.departLocal}>
                <div className="grid grid-cols-[3.5rem_1fr] gap-3">
                  <div className="text-right">
                    <p className="font-semibold tabular-nums">{localClock(s.departLocal)}</p>
                    <p className="mt-10 font-semibold tabular-nums">{localClock(s.arriveLocal)}</p>
                  </div>
                  <div className="relative border-l-2 border-dashed pl-4">
                    <span className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-primary" />
                    <span className="absolute -left-[5px] bottom-1.5 h-2 w-2 rounded-full border-2 border-primary bg-background" />
                    <p className="font-semibold">{s.origin.iata}{s.origin.terminal && <span className="ml-1 text-xs font-normal text-muted-foreground">Terminal {s.origin.terminal}</span>}</p>
                    <p className="my-2 text-sm text-muted-foreground">
                      <Plane className="mr-1 inline h-3.5 w-3.5 rotate-90" aria-hidden />
                      {s.carrier.name} {s.flightNumber} · {formatDuration(s.durationMin)}
                      {s.aircraft && ` · ${s.aircraft}`} · {cabinLabel(s.cabin)}
                      {s.operatedBy && <span className="block text-xs">Operated by {s.operatedBy.name}</span>}
                    </p>
                    <p className="font-semibold">{s.destination.iata}{s.destination.terminal && <span className="ml-1 text-xs font-normal text-muted-foreground">Terminal {s.destination.terminal}</span>}</p>
                  </div>
                </div>
                {next && (
                  <div className="my-3 ml-[4.25rem]">
                    <Badge variant={layoverMin(s.arriveLocal, next.departLocal) < 60 ? "warning" : "secondary"}>
                      {formatDuration(layoverMin(s.arriveLocal, next.departLocal))} layover in {s.destination.iata}
                    </Badge>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </Card>
  );
}

export function FlightDetail({ offerId }: { offerId: string }) {
  const router = useRouter();
  const { trip, setFlight } = useTrip();
  const stored = trip.flight?.id === offerId ? trip.flight : null;

  // Deep links / refreshes: fall back to the server's offer cache when this tab doesn't hold the offer.
  const { data, error, isLoading, refetch } = useQuery<{ data: FlightOffer }, ApiClientError>({
    queryKey: ["offer", "flight", offerId],
    queryFn: ({ signal }) => fetchJson(`/api/offers/flight/${encodeURIComponent(offerId)}`, { signal }),
    enabled: !stored,
    retry: false,
    staleTime: Infinity,
  });
  const offer = stored ?? data?.data ?? null;

  useEffect(() => {
    if (!stored && data?.data) setFlight(data.data, null);
  }, [stored, data, setFlight]);

  if (!offer && isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  if (!offer) {
    const expired = error?.status === 410;
    return (
      <div className="mx-auto max-w-xl space-y-4">
        {expired ? (
          <Alert variant="warning">
            <AlertDescription>This fare has expired, since prices are only held for a short time. Run your search again to see current fares.</AlertDescription>
          </Alert>
        ) : (
          <ErrorState error={error ?? new Error("Offer not found")} onRetry={() => void refetch()} />
        )}
        <Button asChild><Link href="/">New search</Link></Button>
      </div>
    );
  }

  const hotelQuery = hotelSearchToQuery({ ...hotelSearchFromFlight(offer, { adults: offer.travelers.adults + offer.travelers.children }) });
  const total = offer.travelers.adults + offer.travelers.children + offer.travelers.infants;

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => (trip.flightQuery ? router.push(`/flights?${trip.flightQuery}`) : router.back())} className="-ml-2">
          <ArrowLeft /> Back to results
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">{offer.slices[0].origin} → {offer.slices[0].destination}</h1>
        {offer.slices.map((s) => <SliceDetail key={s.direction} slice={s} />)}
        <Card>
          <div className="flex flex-wrap gap-x-6 gap-y-2 p-4 text-sm sm:p-5">
            <span className="flex items-center gap-2"><Briefcase className="h-4 w-4 text-muted-foreground" />{offer.checkedBags === null ? "Baggage: check with airline" : offer.checkedBags > 0 ? `${offer.checkedBags} checked bag included` : "No checked bag included"}</span>
            <span>Validating carrier: {offer.validatingCarrier.name}</span>
            {offer.seatsLeft !== null && offer.seatsLeft <= 9 && <span className="text-warning">{offer.seatsLeft} seats left at this fare</span>}
          </div>
        </Card>
      </div>

      <aside className="lg:sticky lg:top-20 lg:self-start" aria-label="Price and actions">
        <Card className="p-4 sm:p-5">
          <p className="text-sm text-muted-foreground">{total} traveller{total > 1 ? "s" : ""}, all taxes included</p>
          <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums">{formatMoney(offer.price.totalMinor, offer.price.currency)}</p>
          <div className="mt-5 space-y-2">
            <Button size="lg" className="w-full" asChild>
              <Link href={`/hotels?${hotelQuery}`}><Hotel /> Continue to hotels</Link>
            </Button>
            <Button size="lg" variant="outline" className="w-full" asChild>
              <Link href="/booking">Book flight only</Link>
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">Fares are held briefly. You'll confirm the final price at checkout.</p>
        </Card>
      </aside>
    </div>
  );
}
