import { Worker, type Job } from "bullmq";
import type { EventName } from "@fh/domain/events";
import { expirePendingBookings } from "@fh/api/booking";
import { scanPriceWatches } from "@fh/api/alerts";
import { dispatch } from "@fh/api/events";
import { sweepCheckinReminders } from "@fh/api/notify";
import { bullConnection, getQueue, QUEUE_NAMES } from "@fh/api/queues";
import { claimDueInstances, pollFlightInstance } from "@fh/api/tracking";
import { prisma } from "@fh/db";

const log = (msg: string, extra?: unknown) => console.log(`[worker ${new Date().toISOString()}] ${msg}`, extra ?? "");
const connection = bullConnection();

// ── events: booking.created, flight.status.changed, price.alert.triggered, checkin.reminder.due ──
const events = new Worker(
  QUEUE_NAMES.events,
  async (job: Job) => dispatch(job.name as EventName, job.data),
  { connection, concurrency: 10 },
);

// ── tracking: one poll per due flight (provider calls are rate-limited here) ──
const tracking = new Worker(
  QUEUE_NAMES.tracking,
  async (job: Job<{ flightInstanceId: string }>) => {
    const r = await pollFlightInstance(job.data.flightInstanceId);
    if (r.events.length) log(`flight ${job.data.flightInstanceId}: ${r.events.map((e) => e.kind).join(", ")}`);
    if (r.done) log(`flight ${job.data.flightInstanceId}: tracking finished`);
  },
  { connection, concurrency: 5, limiter: { max: 10, duration: 1000 } },
);

// ── maintenance: repeatable schedulers ──
const maintenance = new Worker(
  QUEUE_NAMES.maintenance,
  async (job: Job) => {
    switch (job.name) {
      case "tracking.tick": {
        // Every 30s: find watched flights whose nextPollAt has passed and fan out one job each.
        const ids = await claimDueInstances(200);
        const bucket = Math.floor(Date.now() / 30_000);
        await Promise.all(
          ids.map((id) => getQueue(QUEUE_NAMES.tracking).add("poll-flight", { flightInstanceId: id }, { jobId: `poll-${id}-${bucket}`, attempts: 3, backoff: { type: "exponential", delay: 10_000 } })),
        );
        if (ids.length) log(`tracking.tick enqueued ${ids.length}`);
        return;
      }
      case "watches.scan":
        log("watches.scan", await scanPriceWatches());
        return;
      case "reminders.sweep": {
        const n = await sweepCheckinReminders();
        if (n) log(`reminders.sweep checked ${n}`);
        return;
      }
      case "bookings.expire": {
        const n = await expirePendingBookings();
        if (n) log(`bookings.expire released ${n}`);
        return;
      }
      case "cleanup": {
        const positions = await prisma.flightPosition.deleteMany({ where: { recordedAt: { lt: new Date(Date.now() - 14 * 86_400_000) } } });
        const hooks = await prisma.processedWebhookEvent.deleteMany({ where: { processedAt: { lt: new Date(Date.now() - 30 * 86_400_000) } } });
        const snaps = await prisma.priceSnapshot.deleteMany({ where: { capturedAt: { lt: new Date(Date.now() - 365 * 86_400_000) } } });
        log("cleanup", { positions: positions.count, webhooks: hooks.count, snapshots: snaps.count });
        return;
      }
    }
  },
  { connection, concurrency: 1 },
);

// upsertJobScheduler is idempotent: restarting the worker doesn't duplicate schedules.
const m = getQueue(QUEUE_NAMES.maintenance);
await Promise.all([
  m.upsertJobScheduler("tracking-tick", { every: 30_000 }, { name: "tracking.tick" }),
  m.upsertJobScheduler("watches-scan", { every: 15 * 60_000 }, { name: "watches.scan" }),
  m.upsertJobScheduler("reminders-sweep", { every: 10 * 60_000 }, { name: "reminders.sweep" }),
  m.upsertJobScheduler("bookings-expire", { every: 5 * 60_000 }, { name: "bookings.expire" }),
  m.upsertJobScheduler("cleanup-daily", { pattern: "0 3 * * *" }, { name: "cleanup" }),
]);

for (const [name, w] of Object.entries({ events, tracking, maintenance })) {
  w.on("failed", (job, err) => log(`${name} job ${job?.name} failed (attempt ${job?.attemptsMade}): ${err.message}`));
  w.on("error", (err) => log(`${name} worker error: ${err.message}`));
}
log("worker started: events, tracking, maintenance");

async function shutdown(signal: string) {
  log(`${signal} received, draining…`);
  await Promise.all([events.close(), tracking.close(), maintenance.close()]);
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
