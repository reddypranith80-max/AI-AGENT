import { FlightOfferSkeletons } from "@/components/flights/flight-offer-card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-16 w-full rounded-xl" />
      <FlightOfferSkeletons />
    </div>
  );
}
