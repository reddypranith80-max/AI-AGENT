import * as React from "react";
import { Cta, EmailLayout, H1, KV, P, Panel, Pill, RouteRow } from "../layout";

export type CheckinReminderProps = {
  hoursBefore: 24 | 3;
  flightNumber: string;
  carrier: string;
  from: string;
  to: string;
  departLabel: string; // local time at origin
  arriveLabel: string;
  terminal?: string | null;
  gate?: string | null;
  bookingReference: string;
  checkinUrl: string | null; // airline check-in page when known
  tripUrl: string;
  unsubscribeUrl?: string;
};

export const subject = (p: CheckinReminderProps) =>
  p.hoursBefore === 24
    ? `Check-in is open: ${p.flightNumber} to ${p.to} leaves tomorrow`
    : `Heads up: ${p.flightNumber} to ${p.to} departs in about 3 hours`;

export default function CheckinReminder(p: CheckinReminderProps) {
  const early = p.hoursBefore === 24;
  return (
    <EmailLayout
      preview={early ? `Check in for ${p.flightNumber} now` : `${p.flightNumber} departs soon`}
      unsubscribeUrl={p.unsubscribeUrl}
      reason="You're receiving this because you have an upcoming flight booked with Flight Hotel."
    >
      <Pill tone={early ? "good" : "warn"}>{early ? "CHECK-IN OPEN" : "DEPARTING SOON"}</Pill>
      <H1>{early ? "Time to check in" : "Your flight leaves in about 3 hours"}</H1>
      <P muted>{p.carrier} {p.flightNumber} · Trip {p.bookingReference}</P>

      <Panel>
        <RouteRow from={p.from} to={p.to} departLabel={p.departLabel} arriveLabel={p.arriveLabel} />
      </Panel>

      {p.terminal ? <KV label="Terminal" value={p.terminal} /> : null}
      {p.gate ? <KV label="Gate" value={p.gate} /> : null}

      <P muted>
        {early
          ? "Check in online to pick your seat and get your boarding pass."
          : "Head to the airport if you haven't already. Gates can change, so we'll tell you if it does."}
      </P>
      <Cta href={p.checkinUrl ?? p.tripUrl}>{p.checkinUrl ? "Check in" : "View trip"}</Cta>
    </EmailLayout>
  );
}

CheckinReminder.PreviewProps = {
  hoursBefore: 24, flightNumber: "BA112", carrier: "British Airways", from: "JFK", to: "LHR",
  departLabel: "Sat 1 Mar · 19:30", arriveLabel: "Sun 2 Mar · 07:35", terminal: "7", gate: null,
  bookingReference: "FH-8K2Q9X", checkinUrl: "https://www.britishairways.com/", tripUrl: "https://example.com/trips/1",
} satisfies CheckinReminderProps;
