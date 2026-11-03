import { Queue, type ConnectionOptions } from "bullmq";

/** BullMQ needs its own connection settings (blocking commands, no per-request retry cap). */
export function bullConnection(): ConnectionOptions {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is required for background queues");
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    tls: u.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

export const QUEUE_NAMES = {
  events: "events", // domain events → notification handlers (+ delayed check-in reminders)
  tracking: "tracking", // per-flight poll jobs
  maintenance: "maintenance", // repeatable schedulers (tick, price scan, reconcile, cleanup)
} as const;

export const hasQueues = () => Boolean(process.env.REDIS_URL);

const g = globalThis as unknown as { __queues?: Map<string, Queue> };
export function getQueue(name: string): Queue {
  g.__queues ??= new Map();
  let q = g.__queues.get(name);
  if (!q) {
    q = new Queue(name, {
      connection: bullConnection(),
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: { age: 3600, count: 1000 },
        removeOnFail: { age: 7 * 24 * 3600 },
      },
    });
    g.__queues.set(name, q);
  }
  return q;
}
