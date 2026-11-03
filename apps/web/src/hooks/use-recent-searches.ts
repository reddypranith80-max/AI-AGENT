"use client";

import { useCallback, useSyncExternalStore } from "react";

export type RecentSearch = { query: string; origin: string; destination: string; departureDate: string; returnDate?: string; at: number };

const KEY = "fh.recent.v1";
const MAX = 6;
const EMPTY: RecentSearch[] = [];

let cache: RecentSearch[] | null = null;
const listeners = new Set<() => void>();

function read(): RecentSearch[] {
  if (typeof window === "undefined") return EMPTY;
  if (cache) return cache;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    cache = Array.isArray(parsed) ? (parsed as RecentSearch[]) : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

function write(next: RecentSearch[]) {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function useRecentSearches() {
  const items = useSyncExternalStore(subscribe, read, () => EMPTY);
  const add = useCallback((s: Omit<RecentSearch, "at">) => {
    const without = read().filter((x) => x.query !== s.query);
    write([{ ...s, at: Date.now() }, ...without].slice(0, MAX));
  }, []);
  const clear = useCallback(() => write([]), []);
  return { items, add, clear };
}
