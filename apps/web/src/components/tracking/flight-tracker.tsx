"use client";

import { useEffect, useState } from "react";
import { BellOff, Gauge, Mountain, Plane, PlaneLanding, PlaneTakeoff, Radio, TriangleAlert } from "lucide-react";
import type { FlightStatus, TrackedFlightView } from "@fh/domain/tracking";
import { useFlightTracking, type TrackingConnection } from "@/hooks/use-flight-tracking";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { clock, dateTime, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FlightMap } from "./flight-map";

const STATUS: Record<FlightStatus, { label: string; variant: "success" | "warning" | "destructive" | "secondary" | "default" }> = {
  SCHEDULED: { label: "Scheduled", variant: "secondary" },
  BOARDING: { label: "Boarding", variant: "default" },
  DEPARTED: { label: "Departed", variant: "default" },
  EN_ROUTE: { label: "In the air", variant: "success" },
  LANDED: { label: "Landed", variant: "success" },
  DELAYED: { label: "Delayed", variant: "warning" },
  CANCELLED: { label: "Cancelled", variant: "destructive" },
  DIVERTED: { label: "Diverted", variant: "destructive" },
  UNKNOWN: { label: "Status unknown", variant: "secondary" },
};

const EVENT_COPY: Record<string, (v: TrackedFlightView["events"][number]) => string> = {
  DELAY: (e) => `Delayed by ${String(e.newValue)} min`,
  GATE_CHANGE: (e) => `Gate changed ${String(e.oldValue)} → ${String(e.newValue)}`,
  TERMINAL_CHANGE: (e) => `Terminal changed ${String(e.oldValue)} → ${String(e.newValue)}`,
  CANCELLATION: () => "Flight cancelled",
  DEPARTED: () => "Departed",
  LANDED: () => "Landed",
  DIVERTED: () => "Diverted",
  ETA_CHANGE: () => "Arrival time updated",
};

function ConnectionPill({ state, lastUpdateAt }: { state: TrackingConnection; lastUpdateAt: number | null }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, []);
  const copy: Record<TrackingConnection, string> = {
    idle: "", connecting: "Connecting…", live: "Live", reconnecting: "Reconnecting…", ended: "Tracking ended", error: "Disconnected",
  };
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" role="status" aria-live="polite">
      <Radio className={cn("h-3.5 w-3.5", state === "live" && "text-success animate-plane-pulse", state === "error" && "text-destructive")} />
      {copy[state]}
      {state === "live" && lastUpdateAt ? ` · updated ${relativeTime(lastUpdateAt)}` : ""}
    </span>
  );
}

function Fact({ icon, label, value }: { icon?: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="flex items-center gap-1 text-xs text-muted-foreground">{icon}{label}</dt>
      <dd className="text-sm font-semibold tabular-nums">{value ?? "—"}</dd>
    </div>
  );
}

function FlightCard({ f, onStop }: { f: TrackedFlightView; onStop: (id: string) => void }) {
  const st = STATUS[f.status];
  const otz = f.origin.timezone, dtz = f.destination.timezone;
  const dep = f.actualDepartAt ?? f.estimatedDepartAt ?? f.scheduledDepartAt;
  const arr = f.actualArriveAt ?? f.estimatedArriveAt ?? f.scheduledArriveAt;
  const late = (f.delayMinutes ?? 0) >= 15;

  return (
    <Card className="overflow-hidden">
      <div className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold tracking-tight">{f.flightNumber}</h3>
            <Badge variant={st.variant}>{st.label}{late && f.status === "DELAYED" ? ` · ${f.delayMinutes} min` : ""}</Badge>
          </div>
          {!f.done && (
            <Button variant="ghost" size="sm" onClick={() => onStop(f.flightInstanceId)} aria-label={`Stop tracking ${f.flightNumber}`}>
              <BellOff /> Stop tracking
            </Button>
          )}
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div>
            <p className="text-2xl font-bold tracking-wide">{f.origin.iata}</p>
            <p className="text-xs text-muted-foreground">{f.origin.city}</p>
            <p className={cn("mt-1 text-sm font-semibold tabular-nums", late && !f.actualDepartAt && "text-warning")}>{clock(dep, otz)}</p>
            {late && !f.actualDepartAt && <p className="text-xs text-muted-foreground line-through">{clock(f.scheduledDepartAt, otz)}</p>}
          </div>
          <div className="flex flex-col items-center text-muted-foreground">
            <Plane className="h-5 w-5 rotate-90" aria-hidden />
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold tracking-wide">{f.destination.iata}</p>
            <p className="text-xs text-muted-foreground">{f.destination.city}</p>
            <p className={cn("mt-1 text-sm font-semibold tabular-nums", late && !f.actualArriveAt && "text-warning")}>{clock(arr, dtz)}</p>
            {late && !f.actualArriveAt && <p className="text-xs text-muted-foreground line-through">{clock(f.scheduledArriveAt, dtz)}</p>}
          </div>
        </div>

        {f.status === "CANCELLED" && (
          <Alert variant="destructive">
            <AlertDescription className="flex items-center gap-2"><TriangleAlert className="h-4 w-4 shrink-0" /> This flight was cancelled. Contact the airline about rebooking or a refund.</AlertDescription>
          </Alert>
        )}
        {f.status === "DIVERTED" && (
          <Alert variant="warning"><AlertDescription>This flight was diverted from {f.destination.iata}.</AlertDescription></Alert>
        )}

        <FlightMap flight={f} />

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          <Fact icon={<PlaneTakeoff className="h-3 w-3" />} label="Departure" value={[f.depTerminal && `T${f.depTerminal}`, f.depGate && `Gate ${f.depGate}`].filter(Boolean).join(" · ") || "TBA"} />
          <Fact icon={<PlaneLanding className="h-3 w-3" />} label="Arrival" value={[f.arrTerminal && `T${f.arrTerminal}`, f.arrGate && `Gate ${f.arrGate}`].filter(Boolean).join(" · ") || "TBA"} />
          <Fact icon={<Mountain className="h-3 w-3" />} label="Altitude" value={f.position?.altitudeFt != null ? `${f.position.altitudeFt.toLocaleString()} ft` : "—"} />
          <Fact icon={<Gauge className="h-3 w-3" />} label="Speed" value={f.position?.speedKts != null ? `${f.position.speedKts} kts` : "—"} />
          {f.baggageBelt && <Fact label="Baggage belt" value={f.baggageBelt} />}
        </dl>

        {f.events.length > 0 && (
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Updates</h4>
            <ol className="space-y-1.5">
              {f.events.filter((e) => e.kind in EVENT_COPY).slice(0, 5).map((e) => (
                <li key={e.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <span>{EVENT_COPY[e.kind](e)}</span>
                  <time dateTime={e.detectedAt} className="shrink-0 text-xs text-muted-foreground">{dateTime(e.detectedAt, otz)}</time>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </Card>
  );
}

/** Live tracker for a booking id or flight-instance id. Renders one card per flight (segment). */
export function FlightTracker({ trackingId }: { trackingId: string }) {
  const { flights, connection, lastUpdateAt, stop } = useFlightTracking(trackingId);

  return (
    <section aria-label="Live flight tracking" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Live tracking</h2>
        <ConnectionPill state={connection} lastUpdateAt={lastUpdateAt} />
      </div>

      {connection === "error" && flights.length === 0 && (
        <Alert variant="destructive"><AlertDescription>We couldn't start live tracking for this trip. Refresh to try again.</AlertDescription></Alert>
      )}
      {flights.length === 0 && connection !== "error" && <Skeleton className="h-96 w-full rounded-xl" />}
      {flights.map((f) => (
        <FlightCard key={f.flightInstanceId} f={f} onStop={(id) => void stop(id)} />
      ))}
    </section>
  );
}
