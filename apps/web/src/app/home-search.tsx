"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, History, X } from "lucide-react";
import { flightSearchToQuery, type FlightSearchInput } from "@fh/domain/flights";
import { FlightSearchForm } from "@/components/flights/flight-search-form";
import { Button } from "@/components/ui/button";
import { useRecentSearches } from "@/hooks/use-recent-searches";
import { dateOnly } from "@/lib/format";

export function HomeSearch() {
  const router = useRouter();
  const recent = useRecentSearches();
  const [navigating, setNavigating] = useState(false);

  const go = (v: FlightSearchInput) => {
    const query = flightSearchToQuery(v).toString();
    recent.add({ query, origin: v.origin, destination: v.destination, departureDate: v.departureDate, returnDate: v.returnDate });
    setNavigating(true);
    router.push(`/flights?${query}`);
  };

  return (
    <div className="space-y-6">
      <FlightSearchForm onSearch={go} loading={navigating} />

      {recent.items.length > 0 && (
        <section aria-labelledby="recent-heading" className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 id="recent-heading" className="flex items-center gap-1.5 text-sm font-semibold"><History className="h-4 w-4 text-muted-foreground" /> Recent searches</h2>
            <Button variant="ghost" size="sm" onClick={recent.clear}><X /> Clear</Button>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {recent.items.map((r) => (
              <li key={r.query}>
                <button
                  type="button"
                  onClick={() => router.push(`/flights?${r.query}`)}
                  className="flex w-full items-center justify-between rounded-xl border bg-card px-4 py-3 text-left transition-colors hover:bg-accent"
                >
                  <span>
                    <span className="flex items-center gap-2 font-semibold">{r.origin} <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" /> {r.destination}</span>
                    <span className="text-xs text-muted-foreground">
                      {dateOnly(r.departureDate)}{r.returnDate ? ` – ${dateOnly(r.returnDate)}` : " · one way"}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
