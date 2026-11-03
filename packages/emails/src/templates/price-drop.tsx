import * as React from "react";
import { Cta, EmailLayout, H1, KV, P, Panel, Pill, RouteRow } from "../layout";

export type PriceDropProps = {
  origin: string;
  destination: string;
  departLabel: string; // "Sat 1 Mar"
  returnLabel: string | null;
  cabin: string;
  travellers: number;
  oldPrice: string;
  newPrice: string;
  savings: string; // "$86"
  dropPercent: number; // 12
  searchUrl: string;
  alertsUrl: string;
  unsubscribeUrl?: string;
};

export const subject = (p: PriceDropProps) =>
  `Price drop: ${p.origin} → ${p.destination} now ${p.newPrice} (−${p.dropPercent}%)`;

export default function PriceDrop(p: PriceDropProps) {
  return (
    <EmailLayout
      preview={`${p.origin} → ${p.destination} dropped to ${p.newPrice}`}
      unsubscribeUrl={p.unsubscribeUrl}
      reason="You're receiving this because you set a price alert."
    >
      <Pill tone="good">PRICE DROP −{p.dropPercent}%</Pill>
      <H1>{p.origin} → {p.destination} just got cheaper</H1>
      <P muted>
        The lowest fare for your trip fell from {p.oldPrice} to <strong>{p.newPrice}</strong>, saving you {p.savings}.
      </P>

      <Panel>
        <RouteRow from={p.origin} to={p.destination} departLabel={p.departLabel} arriveLabel={p.returnLabel ? `Return ${p.returnLabel}` : "One way"} />
      </Panel>
      <KV label="Cabin" value={p.cabin} />
      <KV label="Travellers" value={p.travellers} />
      <KV label="Was" value={<span style={{ textDecoration: "line-through" }}>{p.oldPrice}</span>} />
      <KV label="Now" value={p.newPrice} />

      <P muted>Prices change quickly. This fare isn't held until you book.</P>
      <Cta href={p.searchUrl}>See this fare</Cta>
      <P muted>
        <a href={p.alertsUrl} style={{ color: "inherit" }}>Manage your price alerts</a>
      </P>
    </EmailLayout>
  );
}

PriceDrop.PreviewProps = {
  origin: "JFK", destination: "LHR", departLabel: "Sat 1 Mar", returnLabel: "Sat 8 Mar", cabin: "Economy", travellers: 1,
  oldPrice: "$712", newPrice: "$626", savings: "$86", dropPercent: 12,
  searchUrl: "https://example.com/flights", alertsUrl: "https://example.com/alerts",
} satisfies PriceDropProps;
