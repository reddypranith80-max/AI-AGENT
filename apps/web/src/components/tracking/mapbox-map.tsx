"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { greatCircle, type TrackedFlightView } from "@fh/domain/tracking";

type LngLat = [number, number];
const EMPTY_LINE = { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] as LngLat[] } } as const;

const isDark = () => document.documentElement.classList.contains("dark");
const styleFor = () => (isDark() ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/light-v11");

function planeElement() {
  const el = document.createElement("div");
  el.setAttribute("aria-hidden", "true");
  el.style.cssText = "width:36px;height:36px;display:grid;place-items:center";
  el.innerHTML = `<svg viewBox="-16 -16 32 32" width="32" height="32" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.5))"><path d="M0 -13 L4 -3 L13 2 L13 5 L4 3 L3 10 L7 12 L7 14 L0 12.5 L-7 14 L-7 12 L-3 10 L-4 3 L-13 5 L-13 2 L-4 -3 Z" fill="#6366f1" stroke="#fff" stroke-width="1.2"/></svg>`;
  return el;
}

function airportElement(code: string) {
  const el = document.createElement("div");
  el.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:2px;pointer-events:none";
  el.innerHTML = `<span style="font:600 12px system-ui;padding:1px 6px;border-radius:6px;background:rgba(0,0,0,.7);color:#fff">${code}</span><span style="width:10px;height:10px;border-radius:50%;background:#fff;border:2px solid #6366f1"></span>`;
  return el;
}

/** Mapbox GL map: great-circle route, flown trail, and a plane marker that glides between updates. */
export default function MapboxFlightMap({ flight, token }: { flight: TrackedFlightView; token: string }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const plane = useRef<mapboxgl.Marker | null>(null);
  const shown = useRef<LngLat | null>(null); // where the plane is currently drawn (mid-animation)
  const raf = useRef<number>(0);
  const latest = useRef(flight);
  latest.current = flight;

  // ── create once ──
  useEffect(() => {
    if (!container.current) return;
    mapboxgl.accessToken = token;
    const m = new mapboxgl.Map({ container: container.current, style: styleFor(), center: [0, 30], zoom: 1.5, attributionControl: true });
    map.current = m;
    m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

    const addLayers = () => {
      for (const id of ["route", "trail"]) if (!m.getSource(id)) m.addSource(id, { type: "geojson", data: EMPTY_LINE as never });
      if (!m.getLayer("route"))
        m.addLayer({ id: "route", type: "line", source: "route", paint: { "line-color": "#94a3b8", "line-width": 2, "line-dasharray": [2, 2] } });
      if (!m.getLayer("trail"))
        m.addLayer({ id: "trail", type: "line", source: "trail", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#6366f1", "line-width": 3.5 } });
      draw();
    };
    m.on("style.load", addLayers); // also fires after the theme changes the style

    // Follow dark-mode toggles.
    const mo = new MutationObserver(() => m.setStyle(styleFor()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => {
      cancelAnimationFrame(raf.current);
      mo.disconnect();
      m.remove();
      map.current = null;
      plane.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // ── draw route/trail/airports whenever the flight changes ──
  function draw() {
    const m = map.current;
    const f = latest.current;
    if (!m || !m.isStyleLoaded()) return;
    const o = f.origin, d = f.destination;
    const hasRoute = o.lat != null && o.lon != null && d.lat != null && d.lon != null;

    const route = hasRoute ? greatCircle({ lat: o.lat!, lon: o.lon! }, { lat: d.lat!, lon: d.lon! }, 96) : [];
    (m.getSource("route") as mapboxgl.GeoJSONSource | undefined)?.setData({
      ...EMPTY_LINE, geometry: { type: "LineString", coordinates: route.map((p): LngLat => [p.lon, p.lat]) },
    } as never);

    const trail: LngLat[] = f.trail.map((p) => [p.lon, p.lat]);
    (m.getSource("trail") as mapboxgl.GeoJSONSource | undefined)?.setData({
      ...EMPTY_LINE, geometry: { type: "LineString", coordinates: trail },
    } as never);
  }

  const airportMarkers = useRef<mapboxgl.Marker[]>([]);
  const fitted = useRef(false);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const apply = () => {
      draw();
      // Airport pins (rebuilt only when the route changes).
      airportMarkers.current.forEach((x) => x.remove());
      airportMarkers.current = [];
      const pts: LngLat[] = [];
      for (const a of [flight.origin, flight.destination]) {
        if (a.lat == null || a.lon == null) continue;
        pts.push([a.lon, a.lat]);
        airportMarkers.current.push(new mapboxgl.Marker({ element: airportElement(a.iata), anchor: "bottom" }).setLngLat([a.lon, a.lat]).addTo(m));
      }
      if (!fitted.current && pts.length) {
        const b = pts.reduce((acc, p) => acc.extend(p), new mapboxgl.LngLatBounds(pts[0], pts[0]));
        m.fitBounds(b, { padding: { top: 70, bottom: 50, left: 50, right: 50 }, maxZoom: 6, duration: 0 });
        fitted.current = true;
      }
    };
    if (m.isStyleLoaded()) apply();
    else m.once("style.load", apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flight.origin.iata, flight.destination.iata, flight.origin.lat, flight.destination.lat, flight.trail.length]);

  // ── move the plane: glide from where it's drawn to the new fix over ~1.2 s ──
  useEffect(() => {
    const m = map.current;
    const pos = flight.position;
    if (!m) return;
    if (!pos) {
      plane.current?.remove();
      plane.current = null;
      shown.current = null;
      return;
    }
    const target: LngLat = [pos.lon, pos.lat];
    if (!plane.current) {
      plane.current = new mapboxgl.Marker({ element: planeElement(), rotationAlignment: "map", pitchAlignment: "map" }).setLngLat(target).addTo(m);
      shown.current = target;
      if (!fitted.current) {
        m.jumpTo({ center: target, zoom: 4 });
        fitted.current = true;
      }
    }
    plane.current.setRotation(pos.headingDeg ?? 0);

    const from = shown.current ?? target;
    const t0 = performance.now();
    cancelAnimationFrame(raf.current);
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / 1200);
      const e = 1 - (1 - t) ** 3; // ease-out
      const cur: LngLat = [from[0] + (target[0] - from[0]) * e, from[1] + (target[1] - from[1]) * e];
      shown.current = cur;
      plane.current?.setLngLat(cur);
      if (t < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }, [flight.position?.lat, flight.position?.lon, flight.position?.headingDeg]);

  return <div ref={container} className="h-full w-full rounded-xl" role="img" aria-label={`Live map of ${flight.flightNumber}`} />;
}
