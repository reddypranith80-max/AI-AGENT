import type { Metadata } from "next";
import { FlightDetail } from "./flight-detail";

export const metadata: Metadata = { title: "Flight details" };

export default async function FlightDetailPage({ params }: { params: Promise<{ offerId: string }> }) {
  const { offerId } = await params;
  return <FlightDetail offerId={decodeURIComponent(offerId)} />;
}
