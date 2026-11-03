import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl space-y-4" role="status" aria-label="Loading trips">
      <Skeleton className="h-8 w-32" />
      {[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
    </div>
  );
}
