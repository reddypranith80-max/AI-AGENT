"use client";

import { useMemo } from "react";
import type { FlightOffer } from "@fh/domain/flights";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/format";

export type FlightFilterState = {
  maxStops: 0 | 1 | null; // null = any
  airlines: string[]; // empty = all
  maxPriceMinor: number | null;
};
export const NO_FILTERS: FlightFilterState = { maxStops: null, airlines: [], maxPriceMinor: null };

export const activeFilterCount = (f: FlightFilterState) => (f.maxStops !== null ? 1 : 0) + (f.airlines.length ? 1 : 0) + (f.maxPriceMinor !== null ? 1 : 0);

export function filterOffers(offers: FlightOffer[], f: FlightFilterState) {
  return offers.filter(
    (o) =>
      (f.maxStops === null || o.stops <= f.maxStops) &&
      (f.airlines.length === 0 || o.slices.every((s) => s.segments.some((x) => f.airlines.includes(x.carrier.code)))) &&
      (f.maxPriceMinor === null || o.price.totalMinor <= f.maxPriceMinor),
  );
}

export function FlightFilters({ offers, value, onChange }: { offers: FlightOffer[]; value: FlightFilterState; onChange: (v: FlightFilterState) => void }) {
  const { carriers, min, max, currency } = useMemo(() => {
    const byCode = new Map<string, string>();
    for (const o of offers) for (const s of o.slices) for (const x of s.segments) byCode.set(x.carrier.code, x.carrier.name);
    const prices = offers.map((o) => o.price.totalMinor);
    return {
      carriers: [...byCode].sort((a, b) => a[1].localeCompare(b[1])),
      min: Math.min(...prices),
      max: Math.max(...prices),
      currency: offers[0]?.price.currency ?? "USD",
    };
  }, [offers]);

  if (offers.length === 0) return null;
  const cap = value.maxPriceMinor ?? max;
  const stopOptions: { label: string; v: FlightFilterState["maxStops"] }[] = [
    { label: "Any", v: null },
    { label: "Non-stop", v: 0 },
    { label: "Up to 1 stop", v: 1 },
  ];

  return (
    <div className="space-y-6">
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-semibold">Stops</legend>
        <div className="flex flex-wrap gap-2">
          {stopOptions.map((o) => (
            <button
              key={o.label}
              type="button"
              aria-pressed={value.maxStops === o.v}
              onClick={() => onChange({ ...value, maxStops: o.v })}
              className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${value.maxStops === o.v ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="price-cap" className="text-sm font-semibold">Max price</Label>
          <span className="text-sm tabular-nums text-muted-foreground">{formatMoney(cap, currency)}</span>
        </div>
        {min < max ? (
          <input
            id="price-cap"
            type="range"
            min={min}
            max={max}
            step={Math.max(1, Math.round((max - min) / 50))}
            value={cap}
            onChange={(e) => onChange({ ...value, maxPriceMinor: Number(e.target.value) >= max ? null : Number(e.target.value) })}
            className="w-full accent-[hsl(var(--primary))]"
          />
        ) : (
          <p className="text-xs text-muted-foreground">All fares are {formatMoney(min, currency)}.</p>
        )}
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-semibold">Airlines</legend>
        {carriers.map(([code, name]) => {
          const checked = value.airlines.includes(code);
          return (
            <div key={code} className="flex items-center gap-2">
              <Checkbox
                id={`al-${code}`}
                checked={checked}
                onCheckedChange={(c) => onChange({ ...value, airlines: c ? [...value.airlines, code] : value.airlines.filter((x) => x !== code) })}
              />
              <Label htmlFor={`al-${code}`} className="font-normal">{name}</Label>
            </div>
          );
        })}
      </fieldset>
    </div>
  );
}
