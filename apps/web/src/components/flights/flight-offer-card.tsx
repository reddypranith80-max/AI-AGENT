import { Armchair, Briefcase, Plane } from "lucide-react";
import type { FlightOffer, FlightSlice } from "@fh/domain/flights";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDuration, formatMoney, localClock, localDay, stopsLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

function CarrierMark({ code, name }: { code: string; name: string }) {
  return (
    <span title={name} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-secondary text-xs font-bold tracking-wide text-secondary-foreground" aria-hidden>
      {code}
    </span>
  );
}

function SliceRow({ slice }: { slice: FlightSlice }) {
  const first = slice.segments[0];
  const nextDay = slice.arriveLocal.slice(0, 10) !== slice.departLocal.slice(0, 10);
  const carriers = [...new Set(slice.segments.map((s) => s.carrier.name))];
  return (
    <div className="flex items-center gap-3">
      <CarrierMark code={first.carrier.code} name={first.carrier.name} />
      <div className="grid min-w-0 flex-1 grid-cols-[auto_1fr_auto] items-center gap-3">
        <div>
          <p className="text-lg font-semibold leading-none tabular-nums">{localClock(slice.departLocal)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{slice.origin}</p>
        </div>
        <div className="min-w-0 text-center">
          <p className="text-xs text-muted-foreground">{formatDuration(slice.durationMin)}</p>
          <div className="relative my-1 h-px bg-border">
            {slice.stops > 0 &&
              slice.segments.slice(0, -1).map((s, i) => (
                <span
                  key={s.destination.iata + i}
                  className="absolute top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-muted-foreground"
                  style={{ left: `${((i + 1) / slice.segments.length) * 100}%` }}
                />
              ))}
            <Plane className="absolute -top-[7px] right-0 h-3.5 w-3.5 rotate-90 bg-card text-muted-foreground" aria-hidden />
          </div>
          <p className={cn("truncate text-xs", slice.stops === 0 ? "text-success" : "text-muted-foreground")}>
            {stopsLabel(slice.stops)}
            {slice.stops > 0 && ` · ${slice.segments.slice(0, -1).map((s) => s.destination.iata).join(", ")}`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold leading-none tabular-nums">
            {localClock(slice.arriveLocal)}
            {nextDay && <sup className="ml-0.5 text-[10px] font-medium text-muted-foreground">+1</sup>}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{slice.destination}</p>
        </div>
      </div>
      <span className="sr-only">
        {slice.direction === "OUTBOUND" ? "Outbound" : "Return"} {localDay(slice.departLocal)}, {carriers.join(" and ")}
      </span>
    </div>
  );
}

export function FlightOfferCard({
  offer, onSelect, tag, pending,
}: {
  offer: FlightOffer;
  onSelect: (offer: FlightOffer) => void;
  tag?: "Cheapest" | "Fastest";
  pending?: boolean;
}) {
  const carriers = [...new Set(offer.slices.flatMap((s) => s.segments.map((x) => x.carrier.name)))];
  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      <article className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5" aria-label={`${carriers.join(", ")} ${formatMoney(offer.price.totalMinor, offer.price.currency)}`}>
        <div className="flex-1 space-y-4">
          {offer.slices.map((s) => (
            <SliceRow key={s.direction} slice={s} />
          ))}
          <div className="flex flex-wrap items-center gap-1.5 pl-12 text-xs text-muted-foreground">
            <span className="truncate">{carriers.join(" · ")}</span>
            {offer.checkedBags !== null && (
              <Badge variant="secondary"><Briefcase className="h-3 w-3" />{offer.checkedBags > 0 ? `${offer.checkedBags} checked bag${offer.checkedBags > 1 ? "s" : ""}` : "Carry-on only"}</Badge>
            )}
            {offer.seatsLeft !== null && offer.seatsLeft <= 4 && (
              <Badge variant="warning"><Armchair className="h-3 w-3" />{offer.seatsLeft} left</Badge>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 border-t pt-4 sm:w-44 sm:flex-col sm:items-end sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
          <div className="sm:text-right">
            {tag && <Badge variant={tag === "Cheapest" ? "success" : "default"} className="mb-1">{tag}</Badge>}
            <p className="text-2xl font-bold tracking-tight tabular-nums">{formatMoney(offer.price.totalMinor, offer.price.currency)}</p>
            <p className="text-xs text-muted-foreground">
              total · {offer.travelers.adults + offer.travelers.children + offer.travelers.infants} traveller{offer.travelers.adults + offer.travelers.children + offer.travelers.infants > 1 ? "s" : ""}
            </p>
          </div>
          <Button onClick={() => onSelect(offer)} disabled={pending} className="min-w-24">
            Select
          </Button>
        </div>
      </article>
    </Card>
  );
}

export function FlightOfferSkeletons({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading flights">
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} className="p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex-1 space-y-4">
              {[0, 1].map((r) => (
                <div key={r} className="flex items-center gap-3">
                  <div className="h-9 w-9 animate-pulse rounded-lg bg-muted" />
                  <div className="h-8 flex-1 animate-pulse rounded-md bg-muted" />
                </div>
              ))}
            </div>
            <div className="h-16 animate-pulse rounded-md bg-muted sm:w-40" />
          </div>
        </Card>
      ))}
      <span className="sr-only">Loading flights…</span>
    </div>
  );
}
