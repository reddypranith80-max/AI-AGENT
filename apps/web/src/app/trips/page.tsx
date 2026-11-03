import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase } from "lucide-react";
import { listTrips } from "@fh/api/booking";
import { EmptyState } from "@/components/states";
import { TripCard } from "@/components/trips/trip-card";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "My trips" };
export const dynamic = "force-dynamic";

export default async function TripsPage() {
  const userId = await requireUser("/trips");
  const { upcoming, past } = await listTrips(userId);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <h1 className="text-2xl font-bold tracking-tight">My trips</h1>

      {upcoming.length === 0 && past.length === 0 && (
        <EmptyState icon={<Briefcase className="h-5 w-5" />} title="No trips yet" action={<Button asChild><Link href="/">Plan a trip</Link></Button>}>
          Your bookings will appear here, with live flight status.
        </EmptyState>
      )}

      {upcoming.length > 0 && (
        <section aria-labelledby="upcoming" className="space-y-3">
          <h2 id="upcoming" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Upcoming</h2>
          <ul className="space-y-3">{upcoming.map((t) => <li key={t.id}><TripCard trip={t} /></li>)}</ul>
        </section>
      )}

      {past.length > 0 && (
        <section aria-labelledby="past" className="space-y-3">
          <h2 id="past" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Past &amp; cancelled</h2>
          <ul className="space-y-3 opacity-80">{past.map((t) => <li key={t.id}><TripCard trip={t} /></li>)}</ul>
        </section>
      )}
    </div>
  );
}
