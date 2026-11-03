"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TrackedFlightView, TrackingStreamMessage } from "@fh/domain/tracking";
import { fetchJson } from "@/lib/client";

export type TrackingConnection = "idle" | "connecting" | "live" | "reconnecting" | "ended" | "error";
const TRAIL_MAX = 120;

/**
 * Subscribes to /api/track/[id] (Server-Sent Events). `id` is a booking id (all its segments)
 * or a flight-instance id. EventSource reconnects by itself; the server sends a fresh snapshot each time,
 * so state is always rebuilt correctly after a drop.
 */
export function useFlightTracking(id: string | null) {
  const [flights, setFlights] = useState<Record<string, TrackedFlightView>>({});
  const [connection, setConnection] = useState<TrackingConnection>("idle");
  const [lastUpdateAt, setLastUpdateAt] = useState<number | null>(null);

  useEffect(() => {
    if (!id) {
      setConnection("idle");
      return;
    }
    setFlights({});
    setConnection("connecting");
    const es = new EventSource(`/api/track/${id}`);

    const parse = (e: MessageEvent) => JSON.parse(e.data as string) as TrackingStreamMessage;
    const touch = () => setLastUpdateAt(Date.now());

    es.onopen = () => setConnection("live");
    es.addEventListener("snapshot", (e) => {
      const m = parse(e as MessageEvent);
      if (m.type !== "snapshot") return;
      setFlights((f) => ({ ...f, [m.flight.flightInstanceId]: m.flight }));
      setConnection("live");
      touch();
    });
    es.addEventListener("status", (e) => {
      const m = parse(e as MessageEvent);
      if (m.type !== "status") return;
      // A status message carries the whole view; keep the longer local trail so the path doesn't shrink.
      setFlights((f) => {
        const prev = f[m.flight.flightInstanceId];
        const trail = prev && prev.trail.length > m.flight.trail.length ? prev.trail : m.flight.trail;
        return { ...f, [m.flight.flightInstanceId]: { ...m.flight, trail } };
      });
      touch();
    });
    es.addEventListener("position", (e) => {
      const m = parse(e as MessageEvent);
      if (m.type !== "position") return;
      setFlights((f) => {
        const cur = f[m.flightInstanceId];
        if (!cur) return f;
        const trail = [...cur.trail, { lat: m.position.lat, lon: m.position.lon }].slice(-TRAIL_MAX);
        return { ...f, [m.flightInstanceId]: { ...cur, position: m.position, trail } };
      });
      touch();
    });
    es.addEventListener("end", (e) => {
      const m = parse(e as MessageEvent);
      if (m.type !== "end") return;
      setFlights((f) => {
        const cur = f[m.flightInstanceId];
        return cur ? { ...f, [m.flightInstanceId]: { ...cur, done: true, position: null } } : f;
      });
    });
    es.onerror = () => {
      // CLOSED means the server refused (401/404): don't loop. CONNECTING means it's retrying on its own.
      if (es.readyState === EventSource.CLOSED) setConnection("error");
      else setConnection("reconnecting");
    };

    return () => es.close();
  }, [id]);

  const list = useMemo(
    () => Object.values(flights).sort((a, b) => Date.parse(a.scheduledDepartAt) - Date.parse(b.scheduledDepartAt)),
    [flights],
  );
  const allDone = list.length > 0 && list.every((f) => f.done);

  const stop = useCallback(async (flightInstanceId: string) => {
    await fetchJson(`/api/track/${flightInstanceId}`, { method: "DELETE" });
    setFlights((f) => {
      const { [flightInstanceId]: _removed, ...rest } = f;
      return rest;
    });
  }, []);

  return { flights: list, connection: allDone && connection === "live" ? ("ended" as const) : connection, lastUpdateAt, stop };
}
