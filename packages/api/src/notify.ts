import { createHmac, timingSafeEqual } from "node:crypto";
import { Resend } from "resend";
import { prisma, Prisma, type NotificationType } from "@fh/db";
import { formatDuration, formatMoney } from "@fh/domain/flights";
import { formatInZone } from "@fh/domain/time";
import { renderEmail, type EmailTemplateName, type EmailTemplates, type FlightStatusProps } from "@fh/emails";
import { emit, onEvent } from "./events";

// ───────────────────────────── config + urls ─────────────────────────────

const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const from = () => process.env.EMAIL_FROM ?? "Flight Hotel <onboarding@resend.dev>";

// ───────────────────────────── unsubscribe tokens ─────────────────────────────

export type NotificationCategory = "booking" | "price" | "status";
const secret = () => process.env.UNSUBSCRIBE_SECRET ?? process.env.AUTH_SECRET ?? "dev-only-secret";
const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

export function unsubscribeToken(userId: string, category: NotificationCategory | "all") {
  const payload = `${userId}.${category}`;
  return Buffer.from(`${payload}.${sign(payload)}`).toString("base64url");
}

export function verifyUnsubscribeToken(token: string): { userId: string; category: NotificationCategory | "all" } | null {
  try {
    const [userId, category, sig] = Buffer.from(token, "base64url").toString().split(".");
    if (!userId || !category || !sig) return null;
    const expected = sign(`${userId}.${category}`);
    if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    return { userId, category: category as NotificationCategory | "all" };
  } catch {
    return null;
  }
}

const unsubscribeUrl = (userId: string, c: NotificationCategory) => `${appUrl()}/api/unsubscribe?token=${unsubscribeToken(userId, c)}`;

// ───────────────────────────── transport ─────────────────────────────

let resend: Resend | undefined;

async function deliver(msg: { to: string; subject: string; html: string; text: string; unsubscribe?: string }): Promise<string> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    // No provider configured (local dev): show what would be sent.
    console.log(`[email:console] to=${msg.to} subject="${msg.subject}" (${msg.html.length} bytes html)`);
    return "console";
  }
  resend ??= new Resend(key);
  const { data, error } = await resend.emails.send({
    from: from(),
    to: msg.to,
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
    headers: msg.unsubscribe
      ? { "List-Unsubscribe": `<${msg.unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
      : undefined,
  });
  if (error) throw new Error(`Resend: ${error.name}: ${error.message}`);
  return data?.id ?? "unknown";
}

// ───────────────────────────── sendTemplated ─────────────────────────────

export type SendResult = "sent" | "duplicate" | "suppressed" | "disabled";

/**
 * The single path every email takes: preference + suppression checks, idempotent via `dedupeKey`
 * (a retried job never double-sends), persisted as a Notification row, then delivered.
 * Throws on delivery failure so the queue retries; the row is left FAILED and reused on retry.
 */
export async function sendTemplated<K extends EmailTemplateName>(args: {
  userId: string;
  to: string;
  template: K;
  props: EmailTemplates[K];
  type: NotificationType;
  category: NotificationCategory;
  dedupeKey: string;
  bookingId?: string;
}): Promise<SendResult> {
  const { userId, to, template, props, type, category, bookingId } = args;
  const dedupeKey = `${userId}:EMAIL:${args.dedupeKey}`;

  const existing = await prisma.notification.findUnique({ where: { dedupeKey } });
  if (existing && (existing.status === "SENT" || existing.status === "SUPPRESSED")) return "duplicate";

  const record = async (status: "SUPPRESSED") =>
    prisma.notification
      .create({ data: { userId, bookingId, channel: "EMAIL", type, dedupeKey, payload: props as unknown as Prisma.InputJsonValue, status } })
      .catch(() => null);

  // Booking confirmations are transactional and always sent; the rest honour preferences.
  if (category !== "booking") {
    const prefs = await prisma.notificationPreference.findUnique({ where: { userId } });
    const enabled = !prefs || (category === "price" ? prefs.priceAlerts : prefs.flightStatus);
    if (!enabled) {
      await record("SUPPRESSED");
      return "disabled";
    }
  }
  if (await prisma.emailSuppression.findUnique({ where: { email: to.toLowerCase() } })) {
    await record("SUPPRESSED");
    return "suppressed";
  }

  const row =
    existing ??
    (await prisma.notification
      .create({ data: { userId, bookingId, channel: "EMAIL", type, dedupeKey, payload: props as unknown as Prisma.InputJsonValue } })
      .catch(async (e) => {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return null; // lost a race to another worker
        throw e;
      }));
  if (!row) return "duplicate";

  try {
    const unsubscribe = category === "booking" ? undefined : unsubscribeUrl(userId, category);
    const rendered = await renderEmail(template, { ...props, unsubscribeUrl: unsubscribe } as EmailTemplates[K]);
    const messageId = await deliver({ to, ...rendered, unsubscribe });
    await prisma.notification.update({ where: { id: row.id }, data: { status: "SENT", sentAt: new Date(), providerMessageId: messageId, error: null } });
    return "sent";
  } catch (e) {
    await prisma.notification.update({ where: { id: row.id }, data: { status: "FAILED", error: (e as Error).message.slice(0, 500) } });
    throw e;
  }
}

// ───────────────────────────── label helpers ─────────────────────────────

const when = (utc: Date | string, tz: string) =>
  formatInZone(utc, tz, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).replace(",", " ·");
const clock = (utc: Date | string, tz: string) => formatInZone(utc, tz);
const dateLabel = (isoDate: Date) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(isoDate);

// ───────────────────────────── handlers ─────────────────────────────

async function handleBookingCreated({ bookingId }: { bookingId: string }) {
  const b = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      user: true,
      passengers: true,
      hotels: true,
      flights: {
        orderBy: { direction: "asc" },
        include: { segments: { orderBy: { seq: "asc" }, include: { airline: true, origin: true, destination: true } } },
      },
    },
  });
  if (!b) return;

  const names = b.passengers.map((p) => {
    const s = p.snapshot as { firstName?: string; lastName?: string };
    return `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim();
  });

  const flights = b.flights.map((f) => {
    const first = f.segments[0];
    const last = f.segments[f.segments.length - 1];
    return {
      direction: f.direction,
      from: first.originIata,
      to: last.destinationIata,
      departLabel: when(first.departAt, first.origin.timezone),
      arriveLabel: when(last.arriveAt, last.destination.timezone),
      flightNumbers: f.segments.map((s) => `${s.airlineIata}${s.flightNumber}`).join(" · "),
      carrier: first.airline.name,
      duration: formatDuration(Math.round((last.arriveAt.getTime() - first.departAt.getTime()) / 60_000)),
      stops: f.segments.length - 1,
    };
  });

  const h = b.hotels[0];
  const policy = h?.cancellationPolicy as { freeUntil?: string } | null;
  await sendTemplated({
    userId: b.userId,
    to: b.contactEmail,
    template: "booking-confirmation",
    type: "BOOKING_CONFIRMATION",
    category: "booking",
    dedupeKey: `booking:${b.id}`,
    bookingId: b.id,
    props: {
      reference: b.reference,
      viewUrl: `${appUrl()}/trips/${b.id}`,
      passengerNames: names,
      total: formatMoney(Number(b.totalMinor), b.currency),
      flights,
      hotel: h
        ? {
            name: h.hotelName,
            address: h.address,
            checkInLabel: dateLabel(h.checkIn),
            checkOutLabel: dateLabel(h.checkOut),
            nights: Math.round((h.checkOut.getTime() - h.checkIn.getTime()) / 86_400_000),
            roomType: h.roomType,
            freeCancellationUntil: policy?.freeUntil ? dateLabel(new Date(policy.freeUntil)) : null,
          }
        : undefined,
    },
  });

  // Check-in reminders: first segment of each direction, 24h and 3h before departure.
  const now = Date.now();
  for (const f of b.flights) {
    const seg = f.segments[0];
    for (const hoursBefore of [24, 3] as const) {
      const delayMs = seg.departAt.getTime() - hoursBefore * 3_600_000 - now;
      if (delayMs > 0)
        await emit("checkin.reminder.due", { bookingId: b.id, segmentId: seg.id, hoursBefore }, { delayMs, jobId: `checkin-${seg.id}-${hoursBefore}` });
    }
  }
}

async function handleCheckinReminder({ bookingId, segmentId, hoursBefore }: { bookingId: string; segmentId: string; hoursBefore: 24 | 3 }) {
  const seg = await prisma.flightSegment.findUnique({
    where: { id: segmentId },
    include: {
      airline: true,
      origin: true,
      destination: true,
      flightInstance: true,
      bookingFlight: { include: { booking: { include: { user: true } } } },
    },
  });
  const booking = seg?.bookingFlight.booking;
  if (!seg || !booking || booking.id !== bookingId) return;
  if (!["CONFIRMED", "TICKETED"].includes(booking.status) || booking.deletedAt) return;
  if (seg.flightInstance?.status === "CANCELLED" || seg.flightInstance?.status === "LANDED") return;
  // The first-leg sweeper may fire late (e.g. after downtime); a 3h reminder after departure is noise.
  if (seg.departAt.getTime() < Date.now()) return;

  const departAt = seg.flightInstance?.estimatedDepartAt ?? seg.departAt;
  await sendTemplated({
    userId: booking.userId,
    to: booking.contactEmail,
    template: "checkin-reminder",
    type: "CHECKIN_REMINDER",
    category: "status",
    dedupeKey: `checkin:${segmentId}:${hoursBefore}`,
    bookingId,
    props: {
      hoursBefore,
      flightNumber: `${seg.airlineIata}${seg.flightNumber}`,
      carrier: seg.airline.name,
      from: seg.originIata,
      to: seg.destinationIata,
      departLabel: when(departAt, seg.origin.timezone),
      arriveLabel: when(seg.flightInstance?.estimatedArriveAt ?? seg.arriveAt, seg.destination.timezone),
      terminal: seg.flightInstance?.depTerminal,
      gate: seg.flightInstance?.depGate,
      bookingReference: booking.reference,
      checkinUrl: null,
      tripUrl: `${appUrl()}/trips/${booking.id}`,
    },
  });
}

/** Safety net for delayed jobs lost to a Redis flush: DB-driven, idempotent thanks to dedupe keys. */
export async function sweepCheckinReminders() {
  const now = Date.now();
  let sent = 0;
  for (const hoursBefore of [24, 3] as const) {
    // Segments departing within the next `hoursBefore` hours (window start = now, so late sweeps still catch them).
    const segs = await prisma.flightSegment.findMany({
      where: {
        seq: 0,
        departAt: { gt: new Date(now), lte: new Date(now + hoursBefore * 3_600_000) },
        bookingFlight: { booking: { status: { in: ["CONFIRMED", "TICKETED"] }, deletedAt: null } },
      },
      select: { id: true, bookingFlight: { select: { bookingId: true } } },
      take: 500,
    });
    for (const s of segs) {
      await handleCheckinReminder({ bookingId: s.bookingFlight.bookingId, segmentId: s.id, hoursBefore }).then(() => sent++).catch((e) =>
        console.error("[sweep] reminder failed", s.id, (e as Error).message),
      );
    }
  }
  return sent;
}

const STATUS_KINDS = new Set(["DELAY", "GATE_CHANGE", "CANCELLATION", "LANDED", "DIVERTED", "DEPARTED"]);

async function handleFlightStatus({ flightInstanceId, statusEventId }: { flightInstanceId: string; statusEventId: string }) {
  const ev = await prisma.flightStatusEvent.findUnique({
    where: { id: statusEventId },
    include: {
      flightInstance: {
        include: {
          airline: true,
          origin: true,
          destination: true,
          subscriptions: { include: { user: true, booking: true } },
        },
      },
    },
  });
  if (!ev || ev.flightInstanceId !== flightInstanceId || !STATUS_KINDS.has(ev.kind)) return;
  const f = ev.flightInstance;
  const otz = f.origin.timezone;
  const dtz = f.destination.timezone;
  const oldV = ev.oldValue as unknown;
  const newV = ev.newValue as unknown;

  const kind = ev.kind as FlightStatusProps["kind"];
  const delayMinutes = ev.kind === "DELAY" ? Number(newV) : undefined;
  const type = ({
    DELAY: "FLIGHT_DELAYED", GATE_CHANGE: "FLIGHT_GATE_CHANGE", CANCELLATION: "FLIGHT_CANCELLED",
    LANDED: "FLIGHT_LANDED", DEPARTED: "FLIGHT_DEPARTED", DIVERTED: "FLIGHT_CANCELLED",
  } as const)[kind];

  const results = await Promise.allSettled(
    f.subscriptions.map(async (sub) => {
      if (sub.user.deletedAt) return;
      const departAt = f.estimatedDepartAt ?? f.scheduledDepartAt;
      await sendTemplated({
        userId: sub.userId,
        to: sub.booking?.contactEmail ?? sub.user.email,
        template: "flight-status",
        type,
        category: "status",
        dedupeKey: `status:${ev.id}`,
        bookingId: sub.bookingId ?? undefined,
        props: {
          kind,
          flightNumber: `${f.airlineIata}${f.flightNumber}`,
          carrier: f.airline.name,
          from: f.originIata,
          to: f.destinationIata,
          departLabel: when(f.scheduledDepartAt, otz),
          arriveLabel: when(f.scheduledArriveAt, dtz),
          delayMinutes,
          newDepartLabel: kind === "DELAY" ? clock(departAt, otz) : undefined,
          newArriveLabel: kind === "DELAY" && f.estimatedArriveAt ? clock(f.estimatedArriveAt, dtz) : undefined,
          oldGate: kind === "GATE_CHANGE" ? String(oldV) : undefined,
          newGate: kind === "GATE_CHANGE" ? String(newV) : f.arrGate,
          terminal: kind === "LANDED" ? f.arrTerminal : f.depTerminal,
          baggageBelt: f.baggageBelt,
          bookingReference: sub.booking?.reference,
          tripUrl: sub.bookingId ? `${appUrl()}/trips/${sub.bookingId}` : `${appUrl()}/trips`,
          trackUrl: sub.bookingId ? `${appUrl()}/trips/${sub.bookingId}#track` : `${appUrl()}/trips`,
        },
      });
    }),
  );
  await prisma.flightStatusEvent.update({ where: { id: ev.id }, data: { fannedOutAt: new Date() } });
  const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failed.length) throw failed[0].reason; // retry the job; already-sent users are skipped via dedupe keys
}

const PRICE_ALERT_DAILY_CAP = 3;

async function handlePriceAlert({ watchId, newPriceMinor, previousMinor }: { watchId: string; newPriceMinor: number; previousMinor: number }) {
  const w = await prisma.priceWatch.findFirst({ where: { id: watchId, deletedAt: null }, include: { user: true } });
  if (!w || !w.active) return;
  const sentToday = await prisma.notification.count({
    where: { userId: w.userId, type: "PRICE_DROP", createdAt: { gt: new Date(Date.now() - 24 * 3_600_000) } },
  });
  if (sentToday >= PRICE_ALERT_DAILY_CAP) return;

  const pct = Math.max(1, Math.round((1 - newPriceMinor / previousMinor) * 100));
  const search = new URLSearchParams({
    tripType: w.tripType, origin: w.origin, destination: w.destination,
    departureDate: w.departDate.toISOString().slice(0, 10),
    adults: String(w.adults), children: String(w.children), cabinClass: w.cabin, currency: w.currency,
  });
  if (w.returnDate) search.set("returnDate", w.returnDate.toISOString().slice(0, 10));

  const result = await sendTemplated({
    userId: w.userId,
    to: w.user.email,
    template: "price-drop",
    type: "PRICE_DROP",
    category: "price",
    dedupeKey: `price:${w.id}:${newPriceMinor}`,
    props: {
      origin: w.origin,
      destination: w.destination,
      departLabel: dateLabel(w.departDate),
      returnLabel: w.returnDate ? dateLabel(w.returnDate) : null,
      cabin: w.cabin.replace("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()),
      travellers: w.adults + w.children,
      oldPrice: formatMoney(previousMinor, w.currency),
      newPrice: formatMoney(newPriceMinor, w.currency),
      savings: formatMoney(previousMinor - newPriceMinor, w.currency),
      dropPercent: pct,
      searchUrl: `${appUrl()}/flights?${search}`,
      alertsUrl: `${appUrl()}/alerts`,
    },
  });
  if (result === "sent") await prisma.priceWatch.update({ where: { id: w.id }, data: { lastNotifiedMinor: BigInt(newPriceMinor) } });
}

// Registered at import time; the worker and (in no-Redis dev) the web process both load this module.
onEvent("booking.created", handleBookingCreated);
onEvent("checkin.reminder.due", handleCheckinReminder);
onEvent("flight.status.changed", handleFlightStatus);
onEvent("price.alert.triggered", handlePriceAlert);
