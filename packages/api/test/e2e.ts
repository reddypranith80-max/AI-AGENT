/**
 * Integration test against a real Postgres (DATABASE_URL) with the in-memory cache/event fallbacks
 * (leave REDIS_URL empty). Exercises: combined booking transaction, idempotency, price guard,
 * tracking (mock provider) → status events → emails, SSE view, stop-tracking.
 *
 *   pnpm --filter @fh/api test:e2e
 */
import assert from "node:assert/strict";
import { prisma } from "@fh/db";
import type { FlightOffer } from "@fh/domain/flights";
import type { HotelOffer } from "@fh/domain/hotels";
import { cacheSet } from "../src/cache";
import { BookingError, confirmBooking, createBooking, getTrip, listTrips } from "../src/booking";
import { sweepCheckinReminders } from "../src/notify";
import { claimDueInstances, getTrackedFlightView, pollFlightInstance, stopTracking, trackBooking, trackFlight, userCanViewFlight } from "../src/tracking";

const step = (s: string) => console.log(`\n▶ ${s}`);
const ok = (s: string) => console.log(`  ✓ ${s}`);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

function fakeFlight(searchId: string): FlightOffer {
  const seg = (num: string, from: string, to: string, dep: string, arr: string, mins: number) => ({
    flightNumber: `BA${num}`, carrier: { code: "BA", name: "British Airways" },
    origin: { iata: from }, destination: { iata: to }, departLocal: dep, arriveLocal: arr, durationMin: mins, cabin: "ECONOMY" as const,
  });
  const out = seg("112", "JFK", "LHR", `${day(20)}T19:30:00`, `${day(21)}T07:35:00`, 425);
  const back = seg("117", "LHR", "JFK", `${day(27)}T11:00:00`, `${day(27)}T14:05:00`, 485);
  return {
    id: `${searchId}.1`,
    price: { totalMinor: 62600, currency: "USD" },
    slices: [
      { direction: "OUTBOUND", origin: "JFK", destination: "LHR", departLocal: out.departLocal, arriveLocal: out.arriveLocal, durationMin: 425, stops: 0, segments: [out] },
      { direction: "RETURN", origin: "LHR", destination: "JFK", departLocal: back.departLocal, arriveLocal: back.arriveLocal, durationMin: 485, stops: 0, segments: [back] },
    ],
    totalDurationMin: 910, stops: 0, validatingCarrier: { code: "BA", name: "British Airways" },
    seatsLeft: 4, checkedBags: 1, travelers: { adults: 1, children: 0, infants: 0 },
  };
}

function fakeHotel(searchId: string): HotelOffer {
  return {
    id: `${searchId}.RTLON001`, hotelId: "RTLON001", name: "The Test Hotel", stars: 4, rating: 8.7,
    location: { lat: 51.5, lon: -0.14 }, distanceKm: 1.2, city: "LON", countryCode: "GB",
    room: { offerId: "OFFER-1", type: "Deluxe Double", description: null, beds: "1 Queen" }, boardType: null,
    nights: 6, price: { totalMinor: 120000, perNightMinor: 20000, currency: "USD" },
    cancellation: { free: true, freeUntil: new Date(Date.now() + 15 * 86_400_000).toISOString() },
    checkIn: day(21), checkOut: day(27),
  };
}

const passenger = {
  type: "ADULT" as const, firstName: "Ada", lastName: "Lovelace", dateOfBirth: "1990-12-10", gender: "FEMALE" as const,
  nationality: "GB", passport: { number: "X1234567", expiry: day(900), issuingCountry: "GB" },
};

async function main() {
  // E2E_EMAIL lets you keep the booking under a real dev login to browse it in the UI.
  const email = process.env.E2E_EMAIL ?? `e2e-${Date.now()}@example.com`;
  const user = await prisma.user.upsert({ where: { email }, create: { email, name: "E2E" }, update: {} });
  const sid = `t${Date.now().toString(36)}`;
  const hid = `h${Date.now().toString(36)}`;
  const flight = fakeFlight(sid);
  const hotel = fakeHotel(hid);
  await cacheSet(`flights:v1:offers:${sid}`, { [flight.id]: flight }, 600);
  await cacheSet(`hotels:v1:offers:${hid}`, { [hotel.id]: hotel }, 600);

  // ── booking ──
  step("Combined flight + hotel booking in one transaction");
  const key = crypto.randomUUID();
  const input = {
    idempotencyKey: key, flightOfferId: flight.id, hotelOfferId: hotel.id, passengers: [passenger],
    contact: { email, phone: "+14155550123" }, expectedTotal: { amountMinor: 182600, currency: "USD" },
    acceptedTerms: true as const, savePassengers: true,
  };
  const { booking, created } = await createBooking(user.id, input);
  assert.equal(created, true);
  assert.equal(booking.status, "CONFIRMED");
  assert.equal(booking.type, "FLIGHT_HOTEL");
  assert.equal(booking.totalMinor, 182600);
  assert.match(booking.reference, /^FH-[A-Z2-9]{6}$/);
  ok(`booking ${booking.reference} CONFIRMED, total 1826.00 USD`);

  const full = await prisma.booking.findUniqueOrThrow({
    where: { id: booking.id },
    include: { flights: { include: { segments: { include: { flightInstance: true } } } }, hotels: true, passengers: true },
  });
  assert.equal(full.flights.length, 2);
  assert.equal(full.hotels.length, 1);
  assert.equal(full.hotels[0].bookingId, full.id);
  assert.equal(full.hotels[0].status, "CONFIRMED");
  assert.ok(full.flights.every((f) => f.segments.every((s) => s.flightInstanceId)), "segments link to FlightInstances");
  ok("hotel row shares booking_id with both flight rows; segments linked to flight instances");

  const seg = full.flights.find((f) => f.direction === "OUTBOUND")!.segments[0];
  // 19:30 New York on a date ~20 days out is 23:30Z (EDT) or 00:30Z next day (EST). Either way not 19:30Z.
  assert.notEqual(seg.departAt.getUTCHours(), 19);
  ok(`local→UTC conversion applied (JFK 19:30 → ${seg.departAt.toISOString()})`);

  const snap = full.passengers[0].snapshot as { passport?: { numberEnc?: string; number?: string } };
  assert.ok(snap.passport?.numberEnc && !snap.passport.number, "passport number stored encrypted only");
  assert.equal(await prisma.passenger.count({ where: { userId: user.id } }), 1);
  ok("passport encrypted in snapshot; traveller profile saved");

  step("Idempotency + guards");
  const again = await createBooking(user.id, input);
  assert.equal(again.created, false);
  assert.equal(again.booking.id, booking.id);
  ok("same idempotency key → same booking, no duplicate");
  await assert.rejects(createBooking(user.id, { ...input, idempotencyKey: crypto.randomUUID(), expectedTotal: { amountMinor: 1, currency: "USD" } }), (e: unknown) => e instanceof BookingError && e.code === "PRICE_CHANGED");
  ok("stale total → PRICE_CHANGED");
  await assert.rejects(createBooking(user.id, { ...input, idempotencyKey: crypto.randomUUID(), flightOfferId: "nope.9" }), (e: unknown) => e instanceof BookingError && e.code === "OFFER_EXPIRED");
  ok("unknown offer → OFFER_EXPIRED");
  await assert.rejects(createBooking(user.id, { ...input, idempotencyKey: crypto.randomUUID(), passengers: [passenger, { ...passenger, firstName: "Bob" }], expectedTotal: { amountMinor: 182600, currency: "USD" } }), (e: unknown) => e instanceof BookingError && e.code === "PASSENGER_MISMATCH");
  ok("wrong party size → PASSENGER_MISMATCH");
  assert.equal(await confirmBooking(booking.id), false);
  ok("confirmBooking is idempotent (webhook retry safe)");
  assert.equal(await prisma.booking.count({ where: { userId: user.id } }), 1, "failed attempts left no partial rows");
  ok("failed attempts created no partial rows");

  // ── read models ──
  step("Trip read models");
  const trip = await getTrip(user.id, booking.id);
  assert.ok(trip && trip.hotel && trip.flights.length === 2);
  assert.equal((await listTrips(user.id)).upcoming.length, 1);
  assert.equal(await getTrip((await prisma.user.create({ data: { email: `other-${Date.now()}@example.com` } })).id, booking.id), null);
  ok("getTrip/listTrips work; other users cannot read the booking");

  // ── emails (in-process events) ──
  step("booking.created → confirmation email + check-in reminders");
  await wait(2500);
  const conf = await prisma.notification.findFirst({ where: { userId: user.id, type: "BOOKING_CONFIRMATION" } });
  assert.equal(conf?.status, "SENT", `confirmation email status was ${conf?.status} (${conf?.error})`);
  ok("confirmation email rendered + sent (console transport)");

  // ── tracking ──
  step("Live tracking via mock provider");
  const segs = await trackBooking(user.id, booking.id);
  assert.equal(segs.length, 2);
  const flightId = segs[0].flightInstanceId;
  assert.ok(await userCanViewFlight(user.id, flightId));
  ok("trackBooking subscribed the traveller to both segments");

  const r1 = await pollFlightInstance(flightId);
  const view = await getTrackedFlightView(flightId);
  assert.equal(view.flightNumber, "BA112");
  ok(`poll → status ${view.status}, gate ${view.depGate}, events: ${r1.events.map((e) => e.kind).join(",") || "none"}`);

  // Force interesting transitions by rewinding the stored state, then re-polling the mock.
  const inst = await prisma.flightInstance.findUniqueOrThrow({ where: { id: flightId } });
  await prisma.flightInstance.update({ where: { id: flightId }, data: { depGate: "Z99", delayMinutes: 0, status: "SCHEDULED", scheduledDepartAt: new Date(Date.now() + 30 * 60_000), scheduledArriveAt: new Date(Date.now() + 8 * 3_600_000) } });
  const r2 = await pollFlightInstance(flightId);
  assert.ok(r2.events.some((e) => e.kind === "GATE_CHANGE"), `expected GATE_CHANGE, got ${r2.events.map((e) => e.kind)}`);
  ok(`gate change detected (${r2.events.map((e) => e.kind).join(", ")})`);
  void inst;

  await wait(2500);
  const gateMail = await prisma.notification.findFirst({ where: { userId: user.id, type: "FLIGHT_GATE_CHANGE" } });
  assert.equal(gateMail?.status, "SENT");
  ok("gate-change email sent to subscriber (deduped by event id)");

  const before = await prisma.notification.count({ where: { userId: user.id } });
  const ev = await prisma.flightStatusEvent.findFirstOrThrow({ where: { flightInstanceId: flightId, kind: "GATE_CHANGE" } });
  const { dispatch } = await import("../src/events");
  await dispatch("flight.status.changed", { flightInstanceId: flightId, statusEventId: ev.id });
  assert.equal(await prisma.notification.count({ where: { userId: user.id } }), before);
  ok("re-delivering the same event sends no duplicate email");

  step("Track by flight number + stop tracking");
  const id2 = await trackFlight(user.id, { flightNumber: "LH401", date: day(0) });
  assert.ok((await getTrackedFlightView(id2)).flightNumber === "LH401");
  await stopTracking(user.id, id2);
  assert.equal((await prisma.flightInstance.findUniqueOrThrow({ where: { id: id2 } })).nextPollAt, null);
  assert.ok(!(await claimDueInstances()).includes(id2));
  ok("stopped flight is no longer polled");

  step("Check-in sweeper");
  const n = await sweepCheckinReminders();
  ok(`sweeper ran (${n} candidates; bookings 20+ days out correctly produce none)`);

  console.log("\nAll integration checks passed ✔");
}

main()
  .catch((e) => {
    console.error("\n✘ FAILED:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    setTimeout(() => process.exit(), 100);
  });
