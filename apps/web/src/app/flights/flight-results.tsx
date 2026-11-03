"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { BellPlus, ChevronDown, SlidersHorizontal } from "lucide-react";
import { flightSearchToQuery, parseFlightSearchQuery, type FlightOffer, type FlightSort } from "@fh/domain/flights";
import { FlightFilters, NO_FILTERS, activeFilterCount, filterOffers, type FlightFilterState } from "@/components/flights/flight-filters";
import { FlightOfferCard, FlightOfferSkeletons } from "@/components/flights/flight-offer-card";
import { FlightSearchForm } from "@/components/flights/flight-search-form";
import { EmptyState, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFlightSearch } from "@/hooks/use-flight-search";
import { useRecentSearches } from "@/hooks/use-recent-searches";
import { useTrip } from "@/hooks/use-trip";
import { dateOnly } from "@/lib/format";

export function FlightResults() {
  const router = useRouter();
  const sp = useSearchParams();
  const recent = useRecentSearches();
  const { setFlight } = useTrip();

  const parsed = useMemo(() => parseFlightSearchQuery(new URLSearchParams(sp.toString())), [sp]);
  const params = parsed.success ? parsed.data : null;

  const [sort, setSort] = useState<FlightSort>("price");
  const [filters, setFilters] = useState<FlightFilterState>(NO_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [editing, setEditing] = useState(false);

  const { offers, meta, isLoading, isFetching, isStale, error, refetch } = useFlightSearch(params, { sort });
  const visible = useMemo(() => filterOffers(offers, filters), [offers, filters]);

  // Badges are computed over the unfiltered set so they stay meaningful while filtering.
  const cheapestId = useMemo(() => [...offers].sort((a, b) => a.price.totalMinor - b.price.totalMinor)[0]?.id, [offers]);
  const fastestId = useMemo(() => [...offers].sort((a, b) => a.totalDurationMin - b.totalDurationMin)[0]?.id, [offers]);

  if (!params) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <EmptyState title="Let's find your flight">Enter your route and dates to see live fares.</EmptyState>
        <FlightSearchForm onSearch={(v) => router.push(`/flights?${flightSearchToQuery(v)}`)} />
      </div>
    );
  }

  const select = (offer: FlightOffer) => {
    setFlight(offer, sp.toString());
    router.push(`/flights/${encodeURIComponent(offer.id)}`);
  };
  const alertHref = `/alerts?${new URLSearchParams({
    tripType: params.tripType, origin: params.origin, destination: params.destination, departDate: params.departureDate,
    ...(params.returnDate ? { returnDate: params.returnDate } : {}), adults: String(params.adults), children: String(params.children), cabin: params.cabinClass,
  })}`;

  const filterCount = activeFilterCount(filters);

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3 sm:p-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{params.origin} → {params.destination}</h1>
          <p className="text-sm text-muted-foreground">
            {dateOnly(params.departureDate)}{params.returnDate ? ` – ${dateOnly(params.returnDate)}` : " · one way"} · {params.adults + params.children + params.infants} traveller{params.adults + params.children + params.infants > 1 ? "s" : ""}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditing((e) => !e)} aria-expanded={editing}>
          Edit search <ChevronDown className={editing ? "rotate-180" : ""} />
        </Button>
      </div>
      {editing && (
        <FlightSearchForm
          defaultValues={params}
          loading={isFetching}
          onSearch={(v) => {
            const q = flightSearchToQuery(v).toString();
            recent.add({ query: q, origin: v.origin, destination: v.destination, departureDate: v.departureDate, returnDate: v.returnDate });
            setEditing(false);
            setFilters(NO_FILTERS);
            router.push(`/flights?${q}`);
          }}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* Filters: sidebar on desktop, disclosure on mobile */}
        <aside aria-label="Filters" className="lg:sticky lg:top-20 lg:self-start">
          <Button variant="outline" size="sm" className="mb-3 lg:hidden" onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters} aria-controls="filters-panel">
            <SlidersHorizontal /> Filters{filterCount ? ` (${filterCount})` : ""}
          </Button>
          <div id="filters-panel" className={`${showFilters ? "block" : "hidden"} rounded-xl border bg-card p-4 lg:block`}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Filters</h2>
              {filterCount > 0 && <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setFilters(NO_FILTERS)}>Reset</Button>}
            </div>
            {offers.length ? <FlightFilters offers={offers} value={filters} onChange={setFilters} /> : <p className="text-sm text-muted-foreground">Filters appear with results.</p>}
          </div>
        </aside>

        <section aria-label="Flight results" className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {isLoading ? "Searching live fares…" : `${visible.length} of ${offers.length} flights`}
              {meta?.cached && " · from cache"}
            </p>
            <Tabs value={sort} onValueChange={(v) => setSort(v as FlightSort)}>
              <TabsList aria-label="Sort by">
                <TabsTrigger value="price">Cheapest</TabsTrigger>
                <TabsTrigger value="duration">Fastest</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {isLoading && <FlightOfferSkeletons />}
          {error && !isLoading && <ErrorState error={error} onRetry={() => void refetch()} />}
          {!isLoading && !error && offers.length === 0 && (
            <EmptyState title="No flights found">Try different dates or nearby airports. Fares on this route may not be available yet.</EmptyState>
          )}
          {!isLoading && offers.length > 0 && visible.length === 0 && (
            <EmptyState title="No flights match your filters">
              <Button variant="outline" onClick={() => setFilters(NO_FILTERS)}>Reset filters</Button>
            </EmptyState>
          )}

          <div className={`space-y-3 transition-opacity ${isStale ? "opacity-60" : ""}`}>
            {visible.map((o) => (
              <FlightOfferCard key={o.id} offer={o} onSelect={select} tag={o.id === cheapestId ? "Cheapest" : o.id === fastestId && sort === "duration" ? "Fastest" : undefined} />
            ))}
          </div>

          {offers.length > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4">
              <p className="text-sm">Not ready to book? Get an email when this fare drops.</p>
              <Button asChild variant="outline" size="sm"><Link href={alertHref}><BellPlus /> Create alert</Link></Button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
