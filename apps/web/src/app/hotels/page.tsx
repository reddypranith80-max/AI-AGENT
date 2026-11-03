import type { Metadata } from "next";
import { Suspense } from "react";
import { HotelSkeletons } from "@/components/hotels/hotel-card";
import { HotelResults } from "./hotel-results";

export const metadata: Metadata = { title: "Hotels" };

export default function HotelsPage() {
  return (
    <Suspense fallback={<HotelSkeletons />}>
      <HotelResults />
    </Suspense>
  );
}
