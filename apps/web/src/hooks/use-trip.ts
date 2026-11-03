"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { FlightOffer } from "@fh/domain/flights";
import type { HotelOffer } from "@fh/domain/hotels";

/**
 * The "trip in progress": the chosen flight and (optionally) hotel on the way to checkout.
 * Held in sessionStorage so it survives refreshes and the sign-in redirect, but not a new browser session.
 * The offers are snapshotted so the booking page can render even if the server-side search cache has expired;
 * the server re-reads and re-validates them when the booking is created.
 */
export type TripDraft = {
  flight: FlightOffer | null;
  hotel: HotelOffer | null;
  /** Query string of the flight search, so "Back to results" works. */
  flightQuery: string | null;
};

const EMPTY: TripDraft = { flight: null, hotel: null, flightQuery: null };
const KEY = "fh.trip.v1";

let cache: TripDraft | null = null;
const listeners = new Set<() => void>();

function read(): TripDraft {
  if (typeof window === "undefined") return EMPTY;
  if (cache) return cache;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    cache = raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<TripDraft>) } : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache;
}

function write(next: TripDraft) {
  cache = next;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage full / blocked: the in-memory copy still works for this page view */
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useTrip() {
  const trip = useSyncExternalStore(subscribe, read, () => EMPTY);

  const setFlight = useCallback((flight: FlightOffer, flightQuery: string | null) => {
    // Choosing a different flight invalidates the hotel dates derived from the old one.
    const prev = read();
    write({ flight, flightQuery, hotel: prev.flight?.id === flight.id ? prev.hotel : null });
  }, []);
  const setHotel = useCallback((hotel: HotelOffer | null) => write({ ...read(), hotel }), []);
  const clear = useCallback(() => write(EMPTY), []);

  const totalMinor = (trip.flight?.price.totalMinor ?? 0) + (trip.hotel?.price.totalMinor ?? 0);
  return { trip, setFlight, setHotel, clear, totalMinor, currency: trip.flight?.price.currency ?? null };
}
