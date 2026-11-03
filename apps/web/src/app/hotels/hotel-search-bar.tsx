"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { hotelSearchSchema, type HotelSearchInput } from "@fh/domain/hotels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { firstIssues } from "@/lib/client";

const locText = (l?: HotelSearchInput["location"]) => (!l ? "" : l.type === "iata" ? l.code : l.type === "city" ? l.name : `${l.lat},${l.lon}`);

/** Compact editable search for the hotel results page. Dates/location arrive pre-filled from the chosen flight. */
export function HotelSearchBar({
  value, loading, onSearch,
}: {
  value: Partial<HotelSearchInput>;
  loading?: boolean;
  onSearch: (v: HotelSearchInput) => void;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const raw = String(f.get("location") ?? "").trim();
    const parsed = hotelSearchSchema.safeParse({
      location: /^[A-Za-z]{3}$/.test(raw) ? { type: "iata", code: raw } : { type: "city", name: raw },
      checkIn: f.get("checkIn"),
      checkOut: f.get("checkOut"),
      adults: Number(f.get("adults")),
      rooms: Number(f.get("rooms")),
      minStars: value.minStars,
      currency: value.currency,
      flightOfferId: value.flightOfferId,
    });
    if (!parsed.success) {
      const issues = parsed.error.flatten();
      setErrors({ ...firstIssues(issues.fieldErrors), ...(issues.fieldErrors.location ? { location: "Enter a city or airport code" } : {}) });
      return;
    }
    setErrors({});
    onSearch(parsed.data);
  }

  const field = (id: string, label: string, el: React.ReactNode) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {el}
      {errors[id] && <p role="alert" className="text-xs text-destructive">{errors[id]}</p>}
    </div>
  );

  return (
    <form onSubmit={submit} noValidate className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_90px_90px_auto] lg:items-end">
      {field("location", "Destination", <Input id="location" name="location" defaultValue={locText(value.location)} placeholder="City or airport code" aria-invalid={!!errors.location} />)}
      {field("checkIn", "Check-in", <Input id="checkIn" name="checkIn" type="date" defaultValue={value.checkIn} aria-invalid={!!errors.checkIn} />)}
      {field("checkOut", "Check-out", <Input id="checkOut" name="checkOut" type="date" defaultValue={value.checkOut} aria-invalid={!!errors.checkOut} />)}
      {field("adults", "Guests", <Input id="adults" name="adults" type="number" min={1} max={9} defaultValue={value.adults ?? 2} />)}
      {field("rooms", "Rooms", <Input id="rooms" name="rooms" type="number" min={1} max={5} defaultValue={value.rooms ?? 1} aria-invalid={!!errors.rooms} />)}
      <Button type="submit" disabled={loading} className="sm:col-span-2 lg:col-span-1"><Search /> Search</Button>
    </form>
  );
}
