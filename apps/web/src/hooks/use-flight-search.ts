"use client";

import { useMemo } from "react";
import { keepPreviousData, skipToken, useQuery } from "@tanstack/react-query";
import { flightSearchToQuery, sortOffers, type FlightSearchInput, type FlightSearchResponse, type FlightSort } from "@fh/domain/flights";
import { ApiClientError, fetchJson } from "@/lib/client";

/**
 * Pass `null` until the user has submitted a valid search.
 * Changing `sort` re-orders locally (no request); the server cache key ignores it too.
 */
export function useFlightSearch(params: FlightSearchInput | null, opts: { sort?: FlightSort } = {}) {
  const sort = opts.sort ?? params?.sort ?? "price";

  const query = useQuery<FlightSearchResponse, ApiClientError>({
    queryKey: ["flights", "search", params && { ...params, sort: undefined }],
    queryFn: params
      ? ({ signal }) => fetchJson<FlightSearchResponse>(`/api/flights/search?${flightSearchToQuery({ ...params, sort: undefined })}`, { signal })
      : skipToken,
    staleTime: 5 * 60_000, // matches the server cache window
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: (n, err) => err.retryable && n < 2,
    retryDelay: (n, err) => (err.retryAfterSec ?? 2 ** n) * 1000,
    placeholderData: keepPreviousData,
  });

  const offers = useMemo(() => sortOffers(query.data?.data ?? [], sort), [query.data, sort]);

  return {
    offers,
    meta: query.data?.meta,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isStale: query.isPlaceholderData, // true while showing the previous search's results
    error: query.error,
    refetch: query.refetch,
  };
}
