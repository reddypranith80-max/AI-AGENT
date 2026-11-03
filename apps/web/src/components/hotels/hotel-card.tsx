import { Check, MapPin, ShieldCheck, Star } from "lucide-react";
import type { HotelOffer } from "@fh/domain/hotels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { dateOnly, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

const ratingWord = (r: number) => (r >= 9 ? "Exceptional" : r >= 8.5 ? "Excellent" : r >= 8 ? "Very good" : r >= 7 ? "Good" : "Fair");

// Amadeus returns no photos, so each hotel gets a stable gradient + monogram instead of a broken image.
const HUES = [243, 199, 152, 27, 335, 262];
const hue = (id: string) => HUES[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % HUES.length];

export function HotelCard({
  hotel, selected, onAdd, onRemove, onBookWithFlight,
}: {
  hotel: HotelOffer;
  selected: boolean;
  onAdd: (h: HotelOffer) => void;
  onRemove: () => void;
  onBookWithFlight: (h: HotelOffer) => void;
}) {
  const h = hue(hotel.hotelId);
  return (
    <Card className={cn("overflow-hidden transition-shadow hover:shadow-md", selected && "ring-2 ring-primary")}>
      <article className="flex flex-col sm:flex-row" aria-label={`${hotel.name}, ${hotel.stars} stars, ${formatMoney(hotel.price.perNightMinor, hotel.price.currency)} per night`}>
        <div
          className="grid h-28 place-items-center text-4xl font-bold text-white/90 sm:h-auto sm:w-44 sm:shrink-0"
          style={{ background: `linear-gradient(135deg, hsl(${h} 70% 45%), hsl(${(h + 40) % 360} 70% 35%))` }}
          aria-hidden
        >
          {hotel.name.charAt(0)}
        </div>

        <div className="flex flex-1 flex-col gap-3 p-4 sm:flex-row sm:p-5">
          <div className="flex-1 space-y-2">
            <div>
              <h3 className="text-base font-semibold leading-snug">{hotel.name}</h3>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="flex" aria-label={`${hotel.stars} stars`}>
                  {Array.from({ length: hotel.stars }, (_, i) => <Star key={i} className="h-3.5 w-3.5 fill-warning text-warning" />)}
                </span>
                {hotel.distanceKm !== null && <span className="flex items-center gap-0.5"><MapPin className="h-3 w-3" />{hotel.distanceKm} km from centre</span>}
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              {hotel.room.type}{hotel.room.beds ? ` · ${hotel.room.beds}` : ""}{hotel.boardType ? ` · ${hotel.boardType}` : ""}
            </p>

            <div className="flex flex-wrap items-center gap-1.5">
              {hotel.rating !== null && (
                <Badge variant="default"><span className="tabular-nums">{hotel.rating.toFixed(1)}</span> {ratingWord(hotel.rating)}</Badge>
              )}
              {hotel.cancellation.free ? (
                <Badge variant="success"><ShieldCheck className="h-3 w-3" />Free cancellation{hotel.cancellation.freeUntil ? ` until ${dateOnly(hotel.cancellation.freeUntil.slice(0, 10))}` : ""}</Badge>
              ) : (
                <Badge variant="secondary">Non-refundable</Badge>
              )}
            </div>
          </div>

          <div className="flex items-end justify-between gap-3 border-t pt-3 sm:w-48 sm:flex-col sm:items-end sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
            <div className="sm:text-right">
              <p className="text-2xl font-bold tracking-tight tabular-nums">{formatMoney(hotel.price.perNightMinor, hotel.price.currency)}</p>
              <p className="text-xs text-muted-foreground">per night · {formatMoney(hotel.price.totalMinor, hotel.price.currency)} for {hotel.nights} night{hotel.nights > 1 ? "s" : ""}</p>
            </div>
            <div className="flex flex-col gap-2">
              {selected ? (
                <Button variant="outline" size="sm" onClick={onRemove}><Check /> Added · Remove</Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => onAdd(hotel)}>Add to trip</Button>
              )}
              <Button size="sm" onClick={() => onBookWithFlight(hotel)}>Book with flight</Button>
            </div>
          </div>
        </div>
      </article>
    </Card>
  );
}

export function HotelSkeletons({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading hotels">
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} className="flex h-40 overflow-hidden">
          <div className="hidden w-44 animate-pulse bg-muted sm:block" />
          <div className="flex-1 space-y-3 p-5">
            <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        </Card>
      ))}
      <span className="sr-only">Loading hotels…</span>
    </div>
  );
}
