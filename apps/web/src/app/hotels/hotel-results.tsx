"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import {
  hotelSearchFromFlight, hotelSearchToQuery, parseHotelSearchQuery,
  type HotelFilters, type HotelOffer, type HotelSort,
} from "@fh/domain/hotels";
import { HotelCard, HotelSkeletons } from "@/components/hotels/hotel-card";
import { EmptyState, ErrorState } from "@/components/states";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useHotelSearch } from "@/hooks/use-hotel-search";
import { useTrip } from "@/hooks/use-trip";
import { dateOnly, formatMoney } from "@/lib/format";
import { HotelSearchBar } from "./hotel-search-bar";

export function HotelResults() {
  const router = useRouter();
  const sp = useSearchParams();
  const { trip, setHotel, totalMinor, currency } = useTrip();

  const parsed = useMemo(() => parseHotelSearchQuery(new URLSearchParams(sp.toString())), [sp]);
  const params = parsed.success ? parsed.data : null;

  // Arrived without search params (e.g. from the nav): seed from the chosen flight.
  useEffect(() => {
    if (!params && trip.flight) {
      const f = trip.flight;
      router.replace(`/hotels?${hotelSearchToQuery({ ...hotelSearchFromFlight(f, { adults: f.travelers.adults + f.travelers.children }) })}`);
    }
  }, [params, trip.flight, router]);

  const [sort, setSort] = useState<HotelSort>("recommended");
  const [freeCancel, setFreeCancel] = useState(false);
  const [minRating, setMinRating] = useState<number | undefined>();
  const [maxNight, setMaxNight] = useState<number | undefined>();
  const [showFilters, setShowFilters] = useState(false);

  const filters: HotelFilters = useMemo(
    () => ({ freeCancellation: freeCancel || undefined, minRating, maxPricePerNightMinor: maxNight }),
    [freeCancel, minRating, maxNight],
  );
  const { hotels, total, meta, isLoading, isFetching, isStale, error, refetch } = useHotelSearch(params, { filters, sort });

  const priceBounds = useMemo(() => {
    const p = hotels.length ? hotels.map((h) => h.price.perNightMinor) : [0];
    return { min: Math.min(...p), max: Math.max(...p) };
  }, [hotels]);

  const setStars = (n: number | undefined) => {
    if (!params) return;
    router.replace(`/hotels?${hotelSearchToQuery({ ...params, minStars: n })}`);
  };

  const add = (h: HotelOffer) => setHotel(h);
  const bookWithFlight = (h: HotelOffer) => {
    setHotel(h);
    router.push(trip.flight ? "/booking" : "/");
  };

  const filterCount = (freeCancel ? 1 : 0) + (minRating ? 1 : 0) + (maxNight ? 1 : 0);
  const cur = meta?.currency ?? currency ?? "USD";

  return (
    <div className="space-y-4 pb-24">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Hotels</h1>
        {params && <p className="text-sm text-muted-foreground">{dateOnly(params.checkIn)} – {dateOnly(params.checkOut)} · {meta?.nights ?? ""} {meta ? `night${meta.nights > 1 ? "s" : ""}` : ""}</p>}
      </div>

      {!trip.flight && (
        <Alert variant="warning">
          <AlertDescription>
            You haven't picked a flight yet. Hotels are booked together with a flight. <Link href="/" className="font-medium underline">Search flights</Link>
          </AlertDescription>
        </Alert>
      )}

      <HotelSearchBar
        value={params ?? {}}
        loading={isFetching}
        onSearch={(v) => router.push(`/hotels?${hotelSearchToQuery({ ...v, flightOfferId: params?.flightOfferId ?? trip.flight?.id })}`)}
      />

      {params && (
        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <aside aria-label="Filters" className="lg:sticky lg:top-20 lg:self-start">
            <Button variant="outline" size="sm" className="mb-3 lg:hidden" onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters} aria-controls="hotel-filters">
              <SlidersHorizontal /> Filters{filterCount ? ` (${filterCount})` : ""}
            </Button>
            <div id="hotel-filters" className={`${showFilters ? "block" : "hidden"} space-y-6 rounded-xl border bg-card p-4 lg:block`}>
              <div className="space-y-1.5">
                <Label htmlFor="stars" className="font-semibold">Star rating</Label>
                <Select value={String(params.minStars ?? 3)} onValueChange={(v) => setStars(Number(v))}>
                  <SelectTrigger id="stars"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n === 5 ? "5 stars" : `${n}+ stars`}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between">
                  <Label htmlFor="max-night" className="font-semibold">Max per night</Label>
                  <span className="text-sm tabular-nums text-muted-foreground">{formatMoney(maxNight ?? priceBounds.max, cur)}</span>
                </div>
                {priceBounds.min < priceBounds.max ? (
                  <input
                    id="max-night" type="range" min={priceBounds.min} max={priceBounds.max}
                    step={Math.max(1, Math.round((priceBounds.max - priceBounds.min) / 50))}
                    value={maxNight ?? priceBounds.max}
                    onChange={(e) => setMaxNight(Number(e.target.value) >= priceBounds.max ? undefined : Number(e.target.value))}
                    className="w-full accent-[hsl(var(--primary))]"
                  />
                ) : <p className="text-xs text-muted-foreground">All stays are the same price.</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="min-rating" className="font-semibold">Guest rating</Label>
                <Select value={String(minRating ?? 0)} onValueChange={(v) => setMinRating(Number(v) || undefined)}>
                  <SelectTrigger id="min-rating"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Any</SelectItem>
                    <SelectItem value="7">7+ Good</SelectItem>
                    <SelectItem value="8">8+ Very good</SelectItem>
                    <SelectItem value="9">9+ Exceptional</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox id="free-cancel" checked={freeCancel} onCheckedChange={(c) => setFreeCancel(c === true)} />
                <Label htmlFor="free-cancel" className="font-normal">Free cancellation</Label>
              </div>
            </div>
          </aside>

          <section aria-label="Hotel results" className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {isLoading ? "Finding stays…" : `${hotels.length} of ${total} hotels`}
              </p>
              <Tabs value={sort} onValueChange={(v) => setSort(v as HotelSort)}>
                <TabsList aria-label="Sort by">
                  <TabsTrigger value="recommended">Best value</TabsTrigger>
                  <TabsTrigger value="price">Price</TabsTrigger>
                  <TabsTrigger value="rating">Rating</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {isLoading && <HotelSkeletons />}
            {error && !isLoading && <ErrorState error={error} onRetry={() => void refetch()} />}
            {!isLoading && !error && total === 0 && (
              <EmptyState title="No hotels available">Nothing is available for these dates. Try fewer stars, or adjust your dates.</EmptyState>
            )}
            {!isLoading && total > 0 && hotels.length === 0 && (
              <EmptyState title="No hotels match your filters">
                <Button variant="outline" onClick={() => { setFreeCancel(false); setMinRating(undefined); setMaxNight(undefined); }}>Reset filters</Button>
              </EmptyState>
            )}
            <div className={`space-y-3 transition-opacity ${isStale ? "opacity-60" : ""}`}>
              {hotels.map((h) => (
                <HotelCard key={h.id} hotel={h} selected={trip.hotel?.id === h.id} onAdd={add} onRemove={() => setHotel(null)} onBookWithFlight={bookWithFlight} />
              ))}
            </div>
          </section>
        </div>
      )}

      {/* Trip summary bar */}
      {trip.flight && (
        <div className="fixed inset-x-0 bottom-14 z-30 border-t bg-background/95 backdrop-blur sm:bottom-0">
          <div className="container flex items-center justify-between gap-3 py-3">
            <div className="min-w-0 text-sm">
              <p className="truncate font-medium">
                {trip.flight.slices[0].origin} → {trip.flight.slices[0].destination}{trip.hotel ? ` + ${trip.hotel.name}` : " · flight only"}
              </p>
              <p className="text-muted-foreground">Total <span className="font-semibold text-foreground tabular-nums">{formatMoney(totalMinor, currency ?? "USD")}</span></p>
            </div>
            <div className="flex shrink-0 gap-2">
              {trip.hotel && <Button variant="ghost" size="sm" onClick={() => setHotel(null)}>Remove hotel</Button>}
              <Button onClick={() => router.push("/booking")}>{trip.hotel ? "Continue" : "Skip hotel"}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
