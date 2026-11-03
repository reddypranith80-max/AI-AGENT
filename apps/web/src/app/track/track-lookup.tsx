"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Radar } from "lucide-react";
import { trackByFlightSchema } from "@fh/domain/tracking";
import { FlightTracker } from "@/components/tracking/flight-tracker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiClientError, fetchJson, firstIssues } from "@/lib/client";

type TrackResponse = { data: { flights: { flightInstanceId: string; flightNumber: string }[] } };

export function TrackLookup() {
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [trackingId, setTrackingId] = useState<string | null>(null);
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

  const track = useMutation<TrackResponse, ApiClientError, { flightNumber: string; date: string }>({
    mutationFn: (body) => fetchJson("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: (r) => setTrackingId(r.data.flights[0]?.flightInstanceId ?? null),
  });

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const parsed = trackByFlightSchema.safeParse({ flightNumber: f.get("flightNumber"), date: f.get("date") });
    if (!parsed.success) return setFieldErrors(firstIssues(parsed.error.flatten().fieldErrors));
    setFieldErrors({});
    setTrackingId(null);
    track.mutate(parsed.data);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Track a flight</h1>
        <p className="text-sm text-muted-foreground">Follow any flight live and get emailed about delays, gate changes and landing.</p>
      </div>

      <Card className="p-4 sm:p-5">
        <form onSubmit={submit} noValidate className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="flightNumber">Flight number</Label>
            <Input id="flightNumber" name="flightNumber" placeholder="BA100" autoCapitalize="characters" autoComplete="off" spellCheck={false} aria-invalid={!!fieldErrors.flightNumber} className="uppercase" />
            {fieldErrors.flightNumber && <p role="alert" className="text-xs text-destructive">{fieldErrors.flightNumber}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="date">Departure date</Label>
            <Input id="date" name="date" type="date" defaultValue={today} aria-invalid={!!fieldErrors.date} />
            {fieldErrors.date && <p role="alert" className="text-xs text-destructive">{fieldErrors.date}</p>}
          </div>
          <Button type="submit" disabled={track.isPending}><Radar /> {track.isPending ? "Finding…" : "Track"}</Button>
        </form>
      </Card>

      {track.error && (
        <Alert variant="destructive"><AlertDescription>{track.error.message}</AlertDescription></Alert>
      )}
      {trackingId && <FlightTracker key={trackingId} trackingId={trackingId} />}
    </div>
  );
}
