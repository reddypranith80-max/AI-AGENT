import * as React from "react";
import { Cta, EmailLayout, H1, KV, P, Panel, Pill, RouteRow } from "../layout";

export type FlightStatusKind = "DELAY" | "GATE_CHANGE" | "CANCELLATION" | "LANDED" | "DEPARTED" | "DIVERTED";

export type FlightStatusProps = {
  kind: FlightStatusKind;
  flightNumber: string; // BA100
  carrier: string;
  from: string;
  to: string;
  departLabel: string; // local time at origin
  arriveLabel: string;
  /** Kind-specific facts, already formatted. */
  delayMinutes?: number;
  newDepartLabel?: string;
  newArriveLabel?: string;
  oldGate?: string | null;
  newGate?: string | null;
  terminal?: string | null;
  baggageBelt?: string | null;
  bookingReference?: string;
  tripUrl: string;
  trackUrl: string;
  unsubscribeUrl?: string;
};

const COPY: Record<FlightStatusKind, { tone: "good" | "warn" | "bad"; label: string; headline: (p: FlightStatusProps) => string }> = {
  DELAY: { tone: "warn", label: "DELAYED", headline: (p) => `${p.flightNumber} is delayed${p.delayMinutes ? ` by ${p.delayMinutes} min` : ""}` },
  GATE_CHANGE: { tone: "warn", label: "GATE CHANGE", headline: (p) => `${p.flightNumber} now departs from gate ${p.newGate ?? "TBA"}` },
  CANCELLATION: { tone: "bad", label: "CANCELLED", headline: (p) => `${p.flightNumber} has been cancelled` },
  LANDED: { tone: "good", label: "LANDED", headline: (p) => `${p.flightNumber} has landed in ${p.to}` },
  DEPARTED: { tone: "good", label: "DEPARTED", headline: (p) => `${p.flightNumber} has taken off` },
  DIVERTED: { tone: "bad", label: "DIVERTED", headline: (p) => `${p.flightNumber} has been diverted` },
};

export const subject = (p: FlightStatusProps) => `${COPY[p.kind].label.charAt(0)}${COPY[p.kind].label.slice(1).toLowerCase()}: ${COPY[p.kind].headline(p)}`;

export default function FlightStatus(p: FlightStatusProps) {
  const c = COPY[p.kind];
  return (
    <EmailLayout
      preview={c.headline(p)}
      unsubscribeUrl={p.unsubscribeUrl}
      reason="You're receiving this because you're tracking this flight."
    >
      <Pill tone={c.tone}>{c.label}</Pill>
      <H1>{c.headline(p)}</H1>
      <P muted>{p.carrier} · {p.from} → {p.to}{p.bookingReference ? ` · Trip ${p.bookingReference}` : ""}</P>

      <Panel>
        <RouteRow from={p.from} to={p.to} departLabel={p.departLabel} arriveLabel={p.arriveLabel} />
      </Panel>

      {p.kind === "DELAY" ? (
        <>
          {p.newDepartLabel ? <KV label="New departure" value={p.newDepartLabel} /> : null}
          {p.newArriveLabel ? <KV label="New arrival" value={p.newArriveLabel} /> : null}
          <P muted>If you have a connection, check it's still feasible.</P>
        </>
      ) : null}

      {p.kind === "GATE_CHANGE" ? (
        <>
          {p.oldGate ? <KV label="Previous gate" value={p.oldGate} /> : null}
          <KV label="New gate" value={p.newGate ?? "TBA"} />
          {p.terminal ? <KV label="Terminal" value={p.terminal} /> : null}
        </>
      ) : null}

      {p.kind === "CANCELLATION" ? (
        <P>
          Please contact {p.carrier} or manage your trip to see rebooking and refund options.
        </P>
      ) : null}

      {p.kind === "LANDED" ? (
        <>
          {p.terminal ? <KV label="Terminal" value={p.terminal} /> : null}
          {p.baggageBelt ? <KV label="Baggage belt" value={p.baggageBelt} /> : null}
        </>
      ) : null}

      <div style={{ height: 8 }} />
      <Cta href={p.kind === "LANDED" || p.kind === "CANCELLATION" ? p.tripUrl : p.trackUrl}>
        {p.kind === "LANDED" || p.kind === "CANCELLATION" ? "View trip" : "Track live"}
      </Cta>
    </EmailLayout>
  );
}

FlightStatus.PreviewProps = {
  kind: "DELAY", flightNumber: "BA112", carrier: "British Airways", from: "JFK", to: "LHR",
  departLabel: "Sat 1 Mar · 19:30", arriveLabel: "Sun 2 Mar · 07:35", delayMinutes: 45,
  newDepartLabel: "20:15", newArriveLabel: "08:20", bookingReference: "FH-8K2Q9X",
  tripUrl: "https://example.com/trips/1", trackUrl: "https://example.com/trips/1#track",
} satisfies FlightStatusProps;
