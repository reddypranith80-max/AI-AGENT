"use client";

import { useMemo } from "react";
import { keepPreviousData, skipToken, useQuery } from "@tanstack/react-query";
import {
  filterHotels, hotelSearchToQuery, sortHotels,
  type HotelFilters, type HotelSearchInput, type HotelSearchResponse, type HotelSort,
} from "@fh/domain/hotels";
import { ApiClientError, fetchJson } from "@/lib/client";

/**
 * Hotel search. The request key only contains what changes the *provider* query (location, dates, party,
 * star floor, currency). Price/free-cancellation/rating filters and sorting run locally on the cached
 * result set, so tweaking them is instant and costs no API calls.
 */
export function useHotelSearch(
  params: HotelSearchInput | null,
  opts: { filters?: HotelFilters; sort?: HotelSort } = {},
) {
  const query = useQuery<HotelSearchResponse, ApiClientError>({
    queryKey: ["hotels", "search", params],
    queryFn: params
      ? ({ signal }) => fetchJson<HotelSearchResponse>(`/api/hotels/search?${hotelSearchToQuery(params)}`, { signal })
      : skipToken,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: (n, err) => err.retryable && n < 2,
    retryDelay: (n, err) => (err.retryAfterSec ?? 2 ** n) * 1000,
    placeholderData: keepPreviousData,
  });

  const { filters, sort = "recommended" } = opts;
  const all = query.data?.data;
  const hotels = useMemo(() => sortHotels(filterHotels(all ?? [], filters), sort), [all, filters, sort]);

  return {
    hotels,
    total: all?.length ?? 0,
    meta: query.data?.meta,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isStale: query.isPlaceholderData,
    error: query.error,
    refetch: query.refetch,
  };
}
