"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellRing, Briefcase, Radar, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export const NAV = [
  { href: "/", label: "Search", icon: Search, match: (p: string) => p === "/" || p.startsWith("/flights") || p.startsWith("/hotels") || p.startsWith("/booking") },
  { href: "/trips", label: "Trips", icon: Briefcase, match: (p: string) => p.startsWith("/trips") },
  { href: "/track", label: "Track", icon: Radar, match: (p: string) => p.startsWith("/track") },
  { href: "/alerts", label: "Alerts", icon: BellRing, match: (p: string) => p.startsWith("/alerts") },
] as const;

export function NavLinks({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className={cn("items-center gap-1", className)}>
      {NAV.map(({ href, label, match }) => {
        const active = match(pathname);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
