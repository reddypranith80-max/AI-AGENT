import { BellRing, Hotel, Radar } from "lucide-react";
import { HomeSearch } from "./home-search";

const FEATURES = [
  { icon: Hotel, title: "Flight + hotel, one checkout", body: "Pick a flight and we'll line up stays for your exact dates." },
  { icon: Radar, title: "Live flight tracking", body: "Watch your plane on the map with gate and delay updates." },
  { icon: BellRing, title: "Price drop alerts", body: "Set a target fare and we'll email you when it falls." },
];

export default function HomePage() {
  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <section className="space-y-3 pt-2 text-center sm:pt-8">
        <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-5xl">Where to next?</h1>
        <p className="text-balance text-muted-foreground sm:text-lg">Search flights, add a hotel, and follow your trip live.</p>
      </section>

      <HomeSearch />

      <ul className="grid gap-4 sm:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <li key={title} className="rounded-xl border bg-card p-4">
            <Icon className="mb-3 h-5 w-5 text-primary" aria-hidden />
            <h2 className="text-sm font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
