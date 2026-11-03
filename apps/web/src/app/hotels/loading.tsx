import { HotelSkeletons } from "@/components/hotels/hotel-card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 w-full rounded-xl" />
      <HotelSkeletons />
    </div>
  );
}
