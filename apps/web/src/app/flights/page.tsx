import type { Metadata } from "next";
import { Suspense } from "react";
import { FlightOfferSkeletons } from "@/components/flights/flight-offer-card";
import { FlightResults } from "./flight-results";

export const metadata: Metadata = { title: "Flights" };

export default function FlightsPage() {
  // useSearchParams() in the client component requires a Suspense boundary.
  return (
    <Suspense fallback={<FlightOfferSkeletons />}>
      <FlightResults />
    </Suspense>
  );
}
