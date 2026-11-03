import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { TrackLookup } from "./track-lookup";

export const metadata: Metadata = { title: "Track a flight" };

export default async function TrackPage() {
  await requireUser("/track");
  return <TrackLookup />;
}
