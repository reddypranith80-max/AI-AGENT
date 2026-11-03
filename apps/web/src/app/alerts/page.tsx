import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { AlertsManager } from "./alerts-manager";

export const metadata: Metadata = { title: "Price alerts" };

export default async function AlertsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (v ? [[k, v]] : [])));
  await requireUser(`/alerts${qs.size ? `?${qs}` : ""}`);
  return <AlertsManager prefill={sp} />;
}
