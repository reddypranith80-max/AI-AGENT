import * as React from "react";
import { Cta, EmailLayout, H1, KV, P, Panel, Pill, RouteRow, Rule } from "../layout";

export type BookingConfirmationProps = {
  reference: string;
  viewUrl: string;
  passengerNames: string[];
  /** Pre-formatted by the sender, e.g. "€1,284.50". */
  total: string;
  flights: {
    direction: "OUTBOUND" | "RETURN";
    from: string;
    to: string;
    departLabel: string; // "Sat 1 Mar · 10:30"
    arriveLabel: string;
    flightNumbers: string; // "BA100 · BA286"
    carrier: string;
    duration: string; // "7h 30m"
    stops: number;
  }[];
  hotel?: {
    name: string;
    address: string | null;
    checkInLabel: string;
    checkOutLabel: string;
    nights: number;
    roomType: string | null;
    freeCancellationUntil: string | null;
  };
  unsubscribeUrl?: string;
};

export const subject = (p: BookingConfirmationProps) =>
  `Booking confirmed · ${p.reference} · ${p.flights[0]?.from} → ${p.flights[0]?.to}`;

export default function BookingConfirmation(p: BookingConfirmationProps) {
  return (
    <EmailLayout
      preview={`Your trip ${p.reference} is confirmed`}
      unsubscribeUrl={p.unsubscribeUrl}
      reason="You're receiving this because you made a booking with Flight Hotel."
    >
      <Pill tone="good">CONFIRMED</Pill>
      <H1>You're all set. Trip {p.reference}</H1>
      <P muted>Keep this reference handy. We'll email you if anything changes with your flights.</P>

      {p.flights.map((f) => (
        <Panel key={f.direction}>
          <P muted>{f.direction === "OUTBOUND" ? "Outbound" : "Return"} · {f.carrier} · {f.flightNumbers}</P>
          <RouteRow
            from={f.from}
            to={f.to}
            departLabel={f.departLabel}
            arriveLabel={f.arriveLabel}
            meta={`${f.duration} · ${f.stops === 0 ? "Non-stop" : `${f.stops} stop${f.stops > 1 ? "s" : ""}`}`}
          />
        </Panel>
      ))}

      {p.hotel ? (
        <Panel>
          <P muted>Stay · {p.hotel.nights} night{p.hotel.nights > 1 ? "s" : ""}</P>
          <P>
            <strong>{p.hotel.name}</strong>
            {p.hotel.address ? <><br />{p.hotel.address}</> : null}
          </P>
          <KV label="Check-in" value={p.hotel.checkInLabel} />
          <KV label="Check-out" value={p.hotel.checkOutLabel} />
          {p.hotel.roomType ? <KV label="Room" value={p.hotel.roomType} /> : null}
          {p.hotel.freeCancellationUntil ? <KV label="Free cancellation until" value={p.hotel.freeCancellationUntil} /> : null}
        </Panel>
      ) : null}

      <Rule />
      <KV label="Travellers" value={p.passengerNames.join(", ")} />
      <KV label="Total paid" value={p.total} />
      <Rule />

      <Cta href={p.viewUrl}>View trip</Cta>
    </EmailLayout>
  );
}

BookingConfirmation.PreviewProps = {
  reference: "FH-8K2Q9X",
  viewUrl: "https://example.com/trips/1",
  passengerNames: ["Ada Lovelace"],
  total: "$1,284.50",
  flights: [
    { direction: "OUTBOUND", from: "JFK", to: "LHR", departLabel: "Sat 1 Mar · 19:30", arriveLabel: "Sun 2 Mar · 07:35", flightNumbers: "BA112", carrier: "British Airways", duration: "7h 05m", stops: 0 },
    { direction: "RETURN", from: "LHR", to: "JFK", departLabel: "Sat 8 Mar · 11:00", arriveLabel: "Sat 8 Mar · 14:05", flightNumbers: "BA117", carrier: "British Airways", duration: "8h 05m", stops: 0 },
  ],
  hotel: { name: "The Ritz London", address: "150 Piccadilly, London", checkInLabel: "Sun 2 Mar", checkOutLabel: "Sat 8 Mar", nights: 6, roomType: "Deluxe Double", freeCancellationUntil: "27 Feb" },
} satisfies BookingConfirmationProps;
