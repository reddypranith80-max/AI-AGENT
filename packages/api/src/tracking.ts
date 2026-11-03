import { prisma, Prisma } from "@fh/db";
import {
  isFinalStatus, trackingChannel,
  type StatusEventKind, type TrackedFlightView, type TrackingSnapshot, type TrackingStreamMessage,
} from "@fh/domain/tracking";
import { FlightAwareProvider, MockTrackingProvider, ProviderError, type TrackingProvider } from "@fh/providers/tracking";
import { emit } from "./events";
import "./notify"; // registers event handlers for the in-process (no-Redis) mode
import { publish } from "./pubsub";
import { ensureAirlines, ensureAirports, isPlaceholderAirport } from "./reference";

// ───────────────────────────── provider ─────────────────────────────

let provider: TrackingProvider | undefined;
export function getTrackingProvider(): TrackingProvider {
  if (provider) return provider;
  const wantReal = (process.env.TRACKING_PROVIDER ?? "mock") === "flightaware";
  provider = wantReal && process.env.FLIGHTAWARE_API_KEY ? FlightAwareProvider.fromEnv() : new MockTrackingProvider();
  return provider;
}

export class TrackingError extends Error {
  constructor(readonly code: "NOT_FOUND" | "BAD_IDENT" | "FORBIDDEN" | "UPSTREAM", message: string) {
    super(message);
    this.name = "TrackingError";
  }
}

export function parseIdent(raw: string): { airlineIata: string; flightNumber: string } {
  const m = /^([A-Z0-9]{2})(\d{1,4}[A-Z]?)$/.exec(raw.replace(/\s/g, "").toUpperCase());
  if (!m) throw new TrackingError("BAD_IDENT", "Use a flight number like BA100");
  return { airlineIata: m[1], flightNumber: m[2].replace(/^0+(?=\d)/, "") };
}

// ───────────────────────────── polling cadence ─────────────────────────────

const MIN = 60_000;

/** When to poll next, or null when tracking is finished. Near departure and in the air: ~90 s. */
export function nextPollAt(
  s: { status: TrackingSnapshot["status"]; scheduledDepartAt: Date; scheduledArriveAt: Date; estimatedDepartAt: Date | null; estimatedArriveAt: Date | null; actualArriveAt: Date | null },
  now = new Date(),
): Date | null {
  if (s.status === "CANCELLED" || s.status === "DIVERTED") return null;
  if (s.status === "LANDED") {
    // One last look 15 min after touchdown for arrival gate / baggage belt, then stop.
    const last = (s.actualArriveAt ?? now).getTime() + 15 * MIN;
    return last > now.getTime() ? new Date(last) : null;
  }
  const dep = (s.estimatedDepartAt ?? s.scheduledDepartAt).getTime();
  const arr = (s.estimatedArriveAt ?? s.scheduledArriveAt).getTime();
  if (now.getTime() > arr + 12 * 3_600_000) return null; // abandoned; the provider never reported a final state
  const untilDep = dep - now.getTime();
  const delay =
    untilDep > 48 * 3_600_000 ? 6 * 3_600_000
    : untilDep > 6 * 3_600_000 ? 30 * MIN
    : untilDep > 60 * MIN ? 5 * MIN
    : now.getTime() > arr ? 15 * MIN // overdue arrival: slow down
    : 90_000;
  return new Date(now.getTime() + delay);
}

// ───────────────────────────── diffing ─────────────────────────────

type Change = { kind: StatusEventKind; oldValue: unknown; newValue: unknown };
type InstanceRow = Prisma.FlightInstanceGetPayload<object>;

/** Which differences are user-visible. Thresholds keep noise (and emails) down. */
export function detectChanges(prev: InstanceRow, next: TrackingSnapshot): Change[] {
  const out: Change[] = [];
  const iso = (d: Date | null) => d?.toISOString() ?? null;

  if (next.status === "CANCELLED" && prev.status !== "CANCELLED")
    out.push({ kind: "CANCELLATION", oldValue: prev.status, newValue: next.status });
  if (next.status === "DIVERTED" && prev.status !== "DIVERTED")
    out.push({ kind: "DIVERTED", oldValue: prev.destinationIata, newValue: next.destinationIata });
  if (next.status === "LANDED" && prev.status !== "LANDED")
    out.push({ kind: "LANDED", oldValue: iso(prev.scheduledArriveAt), newValue: next.actualArriveAt ?? next.estimatedArriveAt });
  if (!prev.actualDepartAt && next.actualDepartAt && next.status !== "CANCELLED")
    out.push({ kind: "DEPARTED", oldValue: iso(prev.scheduledDepartAt), newValue: next.actualDepartAt });

  const prevDelay = prev.delayMinutes ?? 0;
  const nextDelay = next.delayMinutes ?? 0;
  let delayed = false;
  if (!isFinalStatus(next.status) && !next.actualDepartAt && nextDelay >= 15 && Math.abs(nextDelay - prevDelay) >= 15) {
    delayed = true;
    out.push({ kind: "DELAY", oldValue: prevDelay, newValue: nextDelay });
  }

  // A gate/terminal *change* (not first assignment) before pushback.
  if (!next.actualDepartAt && prev.depGate && next.depGate && prev.depGate !== next.depGate)
    out.push({ kind: "GATE_CHANGE", oldValue: prev.depGate, newValue: next.depGate });
  if (!next.actualDepartAt && prev.depTerminal && next.depTerminal && prev.depTerminal !== next.depTerminal)
    out.push({ kind: "TERMINAL_CHANGE", oldValue: prev.depTerminal, newValue: next.depTerminal });

  if (!delayed && prev.estimatedArriveAt && next.estimatedArriveAt) {
    const diff = Math.abs(Date.parse(next.estimatedArriveAt) - prev.estimatedArriveAt.getTime());
    if (diff >= 15 * MIN) out.push({ kind: "ETA_CHANGE", oldValue: iso(prev.estimatedArriveAt), newValue: next.estimatedArriveAt });
  }
  return out;
}

const d = (s: string | null) => (s ? new Date(s) : null);

function instanceData(s: TrackingSnapshot) {
  return {
    status: s.status,
    estimatedDepartAt: d(s.estimatedDepartAt),
    estimatedArriveAt: d(s.estimatedArriveAt),
    actualDepartAt: d(s.actualDepartAt),
    actualArriveAt: d(s.actualArriveAt),
    delayMinutes: s.delayMinutes,
    depTerminal: s.depTerminal,
    depGate: s.depGate,
    arrTerminal: s.arrTerminal,
    arrGate: s.arrGate,
    baggageBelt: s.baggageBelt,
  };
}

// ───────────────────────────── core update ─────────────────────────────

/**
 * Applies a provider snapshot to a FlightInstance: updates the row, appends a position, records
 * status events, schedules the next poll, pushes live updates, and emits `flight.status.changed`.
 */
export async function applySnapshot(instanceId: string, snap: TrackingSnapshot) {
  const prev = await prisma.flightInstance.findUniqueOrThrow({ where: { id: instanceId } });
  const changes = detectChanges(prev, snap);
  const now = new Date();
  const data = instanceData(snap);
  const next = nextPollAt({
    status: snap.status,
    scheduledDepartAt: prev.scheduledDepartAt,
    scheduledArriveAt: prev.scheduledArriveAt,
    estimatedDepartAt: data.estimatedDepartAt,
    estimatedArriveAt: data.estimatedArriveAt,
    actualArriveAt: data.actualArriveAt,
  }, now);

  const posTime = snap.position ? new Date(snap.position.recordedAt) : null;
  const lastPos = posTime
    ? await prisma.flightPosition.findFirst({ where: { flightInstanceId: instanceId }, orderBy: { recordedAt: "desc" }, select: { recordedAt: true } })
    : null;
  const newPosition = snap.position && posTime && (!lastPos || posTime > lastPos.recordedAt) ? snap.position : null;

  const created = await prisma.$transaction(async (tx) => {
    await tx.flightInstance.update({
      where: { id: instanceId },
      data: { ...data, providerRef: snap.providerRef ?? prev.providerRef, lastPolledAt: now, nextPollAt: next },
    });
    if (newPosition) {
      await tx.flightPosition.create({
        data: {
          flightInstanceId: instanceId,
          latitude: newPosition.lat,
          longitude: newPosition.lon,
          altitudeFt: newPosition.altitudeFt,
          speedKts: newPosition.speedKts,
          headingDeg: newPosition.headingDeg,
          onGround: newPosition.onGround,
          recordedAt: new Date(newPosition.recordedAt),
        },
      });
    }
    const ids: { id: string; kind: StatusEventKind }[] = [];
    for (const c of changes) {
      const e = await tx.flightStatusEvent.create({
        data: {
          flightInstanceId: instanceId,
          kind: c.kind,
          oldValue: (c.oldValue ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          newValue: (c.newValue ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        },
      });
      ids.push({ id: e.id, kind: c.kind });
    }
    return ids;
  });

  // ── after commit: live push, then notifications ──
  const done = next === null;
  const channel = trackingChannel(instanceId);
  const changedFields =
    created.length > 0 || prev.status !== snap.status || prev.depGate !== snap.depGate || prev.arrGate !== snap.arrGate ||
    prev.delayMinutes !== snap.delayMinutes || prev.baggageBelt !== snap.baggageBelt;

  if (changedFields || done) {
    const flight = await getTrackedFlightView(instanceId);
    await publish(channel, { type: "status", flight } satisfies TrackingStreamMessage);
  }
  if (newPosition) await publish(channel, { type: "position", flightInstanceId: instanceId, position: newPosition } satisfies TrackingStreamMessage);
  if (done && isFinalStatus(snap.status))
    await publish(channel, { type: "end", flightInstanceId: instanceId, reason: snap.status as "LANDED" | "CANCELLED" | "DIVERTED" } satisfies TrackingStreamMessage);

  // Only user-facing kinds are fanned out; ETA/terminal changes are recorded but silent.
  for (const e of created) {
    if (e.kind === "ETA_CHANGE" || e.kind === "TERMINAL_CHANGE" || e.kind === "DEPARTED") continue;
    await emit("flight.status.changed", { flightInstanceId: instanceId, statusEventId: e.id }, { jobId: `status-${e.id}` });
  }
  return { done, events: created };
}

// ───────────────────────────── instances ─────────────────────────────

type ScheduleInput = {
  airlineIata: string;
  flightNumber: string;
  originIata: string;
  destinationIata: string;
  scheduledDepartAt: Date;
  scheduledArriveAt: Date;
};

/** Creates (or returns) a FlightInstance from schedule data alone, without calling the provider. Used by booking. */
export async function ensureInstanceFromSchedule(tx: Prisma.TransactionClient, s: ScheduleInput) {
  const nextPoll = nextPollAt({
    status: "SCHEDULED", scheduledDepartAt: s.scheduledDepartAt, scheduledArriveAt: s.scheduledArriveAt,
    estimatedDepartAt: null, estimatedArriveAt: null, actualArriveAt: null,
  });
  return tx.flightInstance.upsert({
    where: {
      airlineIata_flightNumber_scheduledDepartAt: {
        airlineIata: s.airlineIata, flightNumber: s.flightNumber, scheduledDepartAt: s.scheduledDepartAt,
      },
    },
    create: { ...s, nextPollAt: nextPoll },
    update: {},
  });
}

async function findOrCreateInstance(ident: { airlineIata: string; flightNumber: string }, date: string) {
  const dayStart = new Date(`${date}T00:00:00Z`);
  const noon = dayStart.getTime() + 12 * 3_600_000;
  const existing = await prisma.flightInstance.findMany({
    where: {
      ...ident,
      scheduledDepartAt: { gte: new Date(dayStart.getTime() - 24 * 3_600_000), lt: new Date(dayStart.getTime() + 48 * 3_600_000) },
    },
  });
  const hit = existing.sort((a, b) => Math.abs(a.scheduledDepartAt.getTime() - noon) - Math.abs(b.scheduledDepartAt.getTime() - noon))[0];
  if (hit) return hit;

  let snap: TrackingSnapshot | null;
  try {
    snap = await getTrackingProvider().lookup({ ...ident, date });
  } catch (err) {
    if (err instanceof ProviderError) throw new TrackingError("UPSTREAM", "Flight data is temporarily unavailable. Try again shortly.");
    throw err;
  }
  if (!snap) throw new TrackingError("NOT_FOUND", `We couldn't find ${ident.airlineIata}${ident.flightNumber} on ${date}.`);

  await ensureAirlines([{ iata: snap.airlineIata }]);
  await ensureAirports([snap.originIata, snap.destinationIata]);
  const inst = await prisma.flightInstance.upsert({
    where: {
      airlineIata_flightNumber_scheduledDepartAt: {
        airlineIata: snap.airlineIata, flightNumber: snap.flightNumber, scheduledDepartAt: new Date(snap.scheduledDepartAt),
      },
    },
    create: {
      airlineIata: snap.airlineIata,
      flightNumber: snap.flightNumber,
      originIata: snap.originIata,
      destinationIata: snap.destinationIata,
      scheduledDepartAt: new Date(snap.scheduledDepartAt),
      scheduledArriveAt: new Date(snap.scheduledArriveAt),
      providerRef: snap.providerRef,
      ...instanceData(snap),
    },
    update: {},
  });
  await applySnapshot(inst.id, snap); // writes first position + next poll; no events (row already matches)
  return inst;
}

async function subscribe(userId: string, flightInstanceId: string, bookingId?: string) {
  await prisma.flightSubscription.upsert({
    where: { userId_flightInstanceId: { userId, flightInstanceId } },
    create: { userId, flightInstanceId, bookingId },
    update: bookingId ? { bookingId } : {},
  });
  // Re-arm polling if it had gone idle.
  await prisma.flightInstance.updateMany({
    where: { id: flightInstanceId, nextPollAt: null, status: { notIn: ["LANDED", "CANCELLED", "DIVERTED"] } },
    data: { nextPollAt: new Date() },
  });
}

/** Track by flight number + date. Returns the flight instance id to stream. */
export async function trackFlight(userId: string, input: { flightNumber: string; date: string }) {
  const inst = await findOrCreateInstance(parseIdent(input.flightNumber), input.date);
  await subscribe(userId, inst.id);
  return inst.id;
}

/** Track every segment of a booking the user owns. Returns segments in departure order. */
export async function trackBooking(userId: string, bookingId: string) {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, userId },
    include: { flights: { include: { segments: { include: { origin: true, destination: true } } } } },
  });
  if (!booking) throw new TrackingError("NOT_FOUND", "Booking not found");

  const segments = booking.flights.flatMap((f) => f.segments).sort((a, b) => a.departAt.getTime() - b.departAt.getTime());
  const out: { segmentId: string; flightInstanceId: string; flightNumber: string }[] = [];
  for (const seg of segments) {
    let instanceId = seg.flightInstanceId;
    if (!instanceId) {
      const inst = await prisma.$transaction((tx) =>
        ensureInstanceFromSchedule(tx, {
          airlineIata: seg.airlineIata, flightNumber: seg.flightNumber,
          originIata: seg.originIata, destinationIata: seg.destinationIata,
          scheduledDepartAt: seg.departAt, scheduledArriveAt: seg.arriveAt,
        }),
      );
      instanceId = inst.id;
      await prisma.flightSegment.update({ where: { id: seg.id }, data: { flightInstanceId: instanceId } });
    }
    await subscribe(userId, instanceId, bookingId);
    out.push({ segmentId: seg.id, flightInstanceId: instanceId, flightNumber: `${seg.airlineIata}${seg.flightNumber}` });
  }
  return out;
}

/** Unsubscribes the user; polling stops once nobody is watching the flight. */
export async function stopTracking(userId: string, flightInstanceId: string) {
  await prisma.flightSubscription.deleteMany({ where: { userId, flightInstanceId } });
  const remaining = await prisma.flightSubscription.count({ where: { flightInstanceId } });
  if (remaining === 0) await prisma.flightInstance.update({ where: { id: flightInstanceId }, data: { nextPollAt: null } });
}

export async function userCanViewFlight(userId: string, flightInstanceId: string) {
  return (await prisma.flightSubscription.count({ where: { userId, flightInstanceId } })) > 0;
}

// ───────────────────────────── polling ─────────────────────────────

/** Claims instances that are due and watched. The short lease prevents double-enqueue if a poll is slow. */
export async function claimDueInstances(limit = 100) {
  const now = new Date();
  const due = await prisma.flightInstance.findMany({
    where: { nextPollAt: { lte: now }, subscriptions: { some: {} } },
    select: { id: true },
    orderBy: { nextPollAt: "asc" },
    take: limit,
  });
  if (due.length === 0) return [];
  await prisma.flightInstance.updateMany({
    where: { id: { in: due.map((x) => x.id) }, nextPollAt: { lte: now } },
    data: { nextPollAt: new Date(now.getTime() + 2 * MIN) },
  });
  return due.map((x) => x.id);
}

export async function pollFlightInstance(instanceId: string) {
  const inst = await prisma.flightInstance.findUnique({
    where: { id: instanceId },
    include: { origin: true, destination: true },
  });
  if (!inst) return { done: true, events: [] };
  if (isFinalStatus(inst.status) && inst.nextPollAt === null) return { done: true, events: [] };

  const coord = (a: typeof inst.origin) => (isPlaceholderAirport(a) ? null : { lat: a.latitude, lon: a.longitude });
  const snap = await getTrackingProvider().lookup({
    airlineIata: inst.airlineIata,
    flightNumber: inst.flightNumber,
    date: inst.scheduledDepartAt.toISOString().slice(0, 10),
    hint: {
      originIata: inst.originIata,
      destinationIata: inst.destinationIata,
      scheduledDepartAt: inst.scheduledDepartAt.toISOString(),
      scheduledArriveAt: inst.scheduledArriveAt.toISOString(),
      providerRef: inst.providerRef,
      origin: coord(inst.origin),
      destination: coord(inst.destination),
    },
  });

  if (!snap) {
    // Provider doesn't know the flight (yet). Back off; give up well after it should have landed.
    const next = nextPollAt({ ...inst, status: inst.status, actualArriveAt: inst.actualArriveAt }) ;
    await prisma.flightInstance.update({ where: { id: instanceId }, data: { lastPolledAt: new Date(), nextPollAt: next } });
    return { done: next === null, events: [] };
  }
  return applySnapshot(instanceId, snap);
}

// ───────────────────────────── view ─────────────────────────────

export async function getTrackedFlightView(instanceId: string): Promise<TrackedFlightView> {
  const f = await prisma.flightInstance.findUniqueOrThrow({
    where: { id: instanceId },
    include: {
      origin: true,
      destination: true,
      positions: { orderBy: { recordedAt: "desc" }, take: 60 },
      events: { orderBy: { detectedAt: "desc" }, take: 12 },
    },
  });
  const airport = (a: typeof f.origin) => ({
    iata: a.iata,
    name: a.name,
    city: a.city,
    lat: isPlaceholderAirport(a) ? null : a.latitude,
    lon: isPlaceholderAirport(a) ? null : a.longitude,
    timezone: a.timezone,
  });
  const iso = (x: Date | null) => x?.toISOString() ?? null;
  const last = f.positions[0];
  return {
    flightInstanceId: f.id,
    flightNumber: `${f.airlineIata}${f.flightNumber}`,
    airlineIata: f.airlineIata,
    origin: airport(f.origin),
    destination: airport(f.destination),
    status: f.status,
    scheduledDepartAt: f.scheduledDepartAt.toISOString(),
    scheduledArriveAt: f.scheduledArriveAt.toISOString(),
    estimatedDepartAt: iso(f.estimatedDepartAt),
    estimatedArriveAt: iso(f.estimatedArriveAt),
    actualDepartAt: iso(f.actualDepartAt),
    actualArriveAt: iso(f.actualArriveAt),
    depTerminal: f.depTerminal,
    depGate: f.depGate,
    arrTerminal: f.arrTerminal,
    arrGate: f.arrGate,
    baggageBelt: f.baggageBelt,
    delayMinutes: f.delayMinutes,
    position: last && !isFinalStatus(f.status)
      ? {
          lat: last.latitude, lon: last.longitude, altitudeFt: last.altitudeFt, speedKts: last.speedKts,
          headingDeg: last.headingDeg, onGround: last.onGround, recordedAt: last.recordedAt.toISOString(),
        }
      : null,
    trail: [...f.positions].reverse().map((p) => ({ lat: p.latitude, lon: p.longitude })),
    events: f.events.map((e) => ({
      id: e.id, kind: e.kind, oldValue: e.oldValue, newValue: e.newValue, detectedAt: e.detectedAt.toISOString(),
    })),
    done: isFinalStatus(f.status) && f.nextPollAt === null,
  };
}
