"use client";

import dynamic from "next/dynamic";
import type { TrackedFlightView } from "@fh/domain/tracking";
import { Skeleton } from "@/components/ui/skeleton";
import { SvgFlightMap } from "./svg-map";

// mapbox-gl touches `window` at import time, so it must never run on the server.
const MapboxFlightMap = dynamic(() => import("./mapbox-map"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

/** Live map. Uses Mapbox GL when NEXT_PUBLIC_MAPBOX_TOKEN is set, otherwise a built-in SVG map. */
export function FlightMap({ flight }: { flight: TrackedFlightView }) {
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border bg-muted sm:aspect-[16/9]">
      {TOKEN ? <MapboxFlightMap flight={flight} token={TOKEN} /> : <SvgFlightMap flight={flight} />}
    </div>
  );
}
