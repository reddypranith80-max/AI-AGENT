import Link from "next/link";
import { ArrowRight, ChevronRight, Hotel, Plane } from "lucide-react";
import type { TripDto } from "@fh/domain/booking";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { dayLabel, formatMoney } from "@/lib/format";

const STATUS = {
  PENDING: { label: "Awaiting payment", variant: "warning" },
  CONFIRMED: { label: "Confirmed", variant: "success" },
  TICKETED: { label: "Ticketed", variant: "success" },
  CANCELLED: { label: "Cancelled", variant: "destructive" },
  FAILED: { label: "Failed", variant: "destructive" },
  REFUNDED: { label: "Refunded", variant: "secondary" },
} as const;

export function TripStatusBadge({ status }: { status: TripDto["status"] }) {
  const s = STATUS[status];
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

export function TripCard({ trip }: { trip: TripDto }) {
  const out = trip.flights.find((f) => f.direction === "OUTBOUND") ?? trip.flights[0];
  const ret = trip.flights.find((f) => f.direction === "RETURN");
  const first = out.segments[0];
  const last = out.segments[out.segments.length - 1];
  const retFirst = ret?.segments[0];
  const days = Math.ceil((Date.parse(trip.departsAt) - Date.now()) / 86_400_000);

  return (
    <Link href={`/trips/${trip.id}`} className="group block rounded-xl focus-visible:outline-none">
      <Card className="transition-shadow group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-ring">
        <div className="flex items-center gap-4 p-4 sm:p-5">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                {first.from.iata} <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden /> {last.to.iata}
              </h3>
              <TripStatusBadge status={trip.status} />
              {days > 0 && days <= 14 && trip.status === "CONFIRMED" && <Badge variant="default">In {days} day{days > 1 ? "s" : ""}</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">
              {dayLabel(first.departAt, first.from.timezone)}
              {retFirst ? ` – ${dayLabel(retFirst.departAt, retFirst.from.timezone)}` : " · one way"}
              {" · "}{last.to.city && last.to.city !== last.to.iata ? last.to.city : last.to.iata}
            </p>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Plane className="h-3 w-3" />{[...new Set(trip.flights.flatMap((f) => f.segments.map((s) => s.airlineName)))].join(", ")}</span>
              {trip.hotel && <span className="flex items-center gap-1"><Hotel className="h-3 w-3" />{trip.hotel.name}</span>}
              <span>Ref {trip.reference}</span>
            </p>
          </div>
          <div className="text-right">
            <p className="font-semibold tabular-nums">{formatMoney(trip.total.amountMinor, trip.total.currency)}</p>
            <ChevronRight className="ml-auto mt-2 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
          </div>
        </div>
      </Card>
    </Link>
  );
}
