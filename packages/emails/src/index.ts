import * as React from "react";
import { render } from "@react-email/render";
import BookingConfirmation, { subject as bookingSubject, type BookingConfirmationProps } from "./templates/booking-confirmation";
import PriceDrop, { subject as priceSubject, type PriceDropProps } from "./templates/price-drop";
import FlightStatus, { subject as statusSubject, type FlightStatusProps } from "./templates/flight-status";
import CheckinReminder, { subject as checkinSubject, type CheckinReminderProps } from "./templates/checkin-reminder";

export type { BookingConfirmationProps, PriceDropProps, FlightStatusProps, CheckinReminderProps };
export type { FlightStatusKind } from "./templates/flight-status";

export type EmailTemplates = {
  "booking-confirmation": BookingConfirmationProps;
  "price-drop": PriceDropProps;
  "flight-status": FlightStatusProps;
  "checkin-reminder": CheckinReminderProps;
};
export type EmailTemplateName = keyof EmailTemplates;

type Entry<P> = { component: (p: P) => React.ReactElement; subject: (p: P) => string };
const registry: { [K in EmailTemplateName]: Entry<EmailTemplates[K]> } = {
  "booking-confirmation": { component: BookingConfirmation, subject: bookingSubject },
  "price-drop": { component: PriceDrop, subject: priceSubject },
  "flight-status": { component: FlightStatus, subject: statusSubject },
  "checkin-reminder": { component: CheckinReminder, subject: checkinSubject },
};

export async function renderEmail<K extends EmailTemplateName>(
  name: K,
  props: EmailTemplates[K],
): Promise<{ subject: string; html: string; text: string }> {
  const entry = registry[name] as Entry<EmailTemplates[K]>;
  const element = React.createElement(entry.component as React.FunctionComponent<EmailTemplates[K]>, props);
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { subject: entry.subject(props), html, text };
}
