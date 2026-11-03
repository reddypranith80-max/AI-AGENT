/**
 * Typed domain events. Emitted by the booking, tracking and alert modules;
 * consumed by notification handlers (see @fh/api/events and apps/worker).
 */
export type DomainEvents = {
  /** A booking was created and is confirmed (or paid). Triggers the confirmation email + reminders. */
  "booking.created": { bookingId: string };
  /** A tracked flight changed in a user-visible way (see FlightStatusEvent). Fans out to subscribers. */
  "flight.status.changed": { flightInstanceId: string; statusEventId: string };
  /** A price watch crossed its threshold. */
  "price.alert.triggered": { watchId: string; newPriceMinor: number; previousMinor: number };
  /** Delayed job: remind the traveller to check in. */
  "checkin.reminder.due": { bookingId: string; segmentId: string; hoursBefore: 24 | 3 };
};

export type EventName = keyof DomainEvents;
export type EventPayload<N extends EventName> = DomainEvents[N];
