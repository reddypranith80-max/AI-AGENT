"use client";

import { useMemo } from "react";
import { greatCircle, type TrackedFlightView } from "@fh/domain/tracking";

const W = 800;
const H = 420;

/** Dependency-free fallback map (equirectangular) used when no Mapbox token is configured. */
export function SvgFlightMap({ flight }: { flight: TrackedFlightView }) {
  const { origin, destination, position, trail } = flight;

  const geo = useMemo(() => {
    const pts: { lat: number; lon: number }[] = [...trail];
    if (position) pts.push(position);
    if (origin.lat != null && origin.lon != null) pts.push({ lat: origin.lat, lon: origin.lon });
    if (destination.lat != null && destination.lon != null) pts.push({ lat: destination.lat, lon: destination.lon });
    if (pts.length === 0) return null;
    const lats = pts.map((p) => p.lat);
    const lons = pts.map((p) => p.lon);
    let [minLat, maxLat, minLon, maxLon] = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)];
    const padLat = Math.max(4, (maxLat - minLat) * 0.25);
    const padLon = Math.max(6, (maxLon - minLon) * 0.25);
    minLat -= padLat; maxLat += padLat; minLon -= padLon; maxLon += padLon;
    const x = (lon: number) => ((lon - minLon) / (maxLon - minLon)) * W;
    const y = (lat: number) => H - ((lat - minLat) / (maxLat - minLat)) * H;
    return { x, y };
  }, [origin, destination, position, trail]);

  if (!geo) {
    return (
      <div className="flex h-full min-h-[240px] items-center justify-center rounded-xl bg-muted text-sm text-muted-foreground">
        Map appears once the flight has coordinates.
      </div>
    );
  }

  const { x, y } = geo;
  const hasRoute = origin.lat != null && origin.lon != null && destination.lat != null && destination.lon != null;
  const route = hasRoute
    ? greatCircle({ lat: origin.lat!, lon: origin.lon! }, { lat: destination.lat!, lon: destination.lon! }, 48).map((p) => `${x(p.lon)},${y(p.lat)}`).join(" ")
    : null;
  const flown = trail.length > 1 ? trail.map((p) => `${x(p.lon)},${y(p.lat)}`).join(" ") : null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Map of ${flight.flightNumber} from ${origin.iata} to ${destination.iata}`} className="h-full w-full rounded-xl bg-muted">
      <defs>
        <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
          <path d="M50 0H0V50" fill="none" className="stroke-border" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width={W} height={H} fill="url(#grid)" />
      {route && <polyline points={route} fill="none" className="stroke-muted-foreground/60" strokeWidth="2" strokeDasharray="6 6" />}
      {flown && <polyline points={flown} fill="none" className="stroke-primary" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
      {hasRoute && (
        <>
          {[origin, destination].map((a) => (
            <g key={a.iata} transform={`translate(${x(a.lon!)} ${y(a.lat!)})`}>
              <circle r="6" className="fill-background stroke-foreground" strokeWidth="2" />
              <text y="-12" textAnchor="middle" className="fill-foreground text-[13px] font-semibold">{a.iata}</text>
            </g>
          ))}
        </>
      )}
      {position && (
        <g transform={`translate(${x(position.lon)} ${y(position.lat)}) rotate(${position.headingDeg ?? 0})`}>
          <circle r="18" className="fill-primary/20 animate-plane-pulse" />
          <path d="M0 -13 L4 -3 L13 2 L13 5 L4 3 L3 10 L7 12 L7 14 L0 12.5 L-7 14 L-7 12 L-3 10 L-4 3 L-13 5 L-13 2 L-4 -3 Z" className="fill-primary stroke-background" strokeWidth="1" />
        </g>
      )}
    </svg>
  );
}
