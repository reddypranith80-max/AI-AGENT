import type { Metadata } from "next";
import { auth } from "@/auth";
import { requireUser } from "@/lib/session";
import { BookingFlow } from "./booking-flow";

export const metadata: Metadata = { title: "Checkout" };

export default async function BookingPage() {
  await requireUser("/booking");
  const session = await auth();
  return <BookingFlow defaultEmail={session?.user?.email ?? ""} />;
}
