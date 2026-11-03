import type { DomainEvents, EventName, EventPayload } from "@fh/domain/events";
import { hasQueues, getQueue, QUEUE_NAMES } from "./queues";

type Handler<N extends EventName> = (payload: EventPayload<N>) => Promise<void>;
type Registry = { [N in EventName]?: Handler<N> };

const registry: Registry = {};

/** Registers the (single) handler for an event. Called once by @fh/api/notify at import time. */
export function onEvent<N extends EventName>(name: N, handler: Handler<N>) {
  (registry as Record<string, unknown>)[name] = handler;
}

export async function dispatch<N extends EventName>(name: N, payload: EventPayload<N>) {
  const h = registry[name] as Handler<N> | undefined;
  if (!h) throw new Error(`No handler registered for event ${name}`);
  await h(payload);
}

/**
 * Emits a domain event.
 *  - With Redis: enqueued on the `events` queue (retried with backoff, optionally delayed, optionally deduped by jobId).
 *  - Without Redis (local dev): handled in-process after the current tick, so the app still works with no worker.
 * Emitters never await the handler: a failing email must not fail a booking.
 */
export async function emit<N extends EventName>(
  name: N,
  payload: DomainEvents[N],
  opts: { delayMs?: number; jobId?: string } = {},
): Promise<void> {
  if (hasQueues()) {
    await getQueue(QUEUE_NAMES.events).add(name, payload, { delay: opts.delayMs, jobId: opts.jobId });
    return;
  }
  const run = () =>
    dispatch(name, payload).catch((e) => console.error(`[events] ${name} handler failed:`, (e as Error).message));
  if (opts.delayMs) {
    // setTimeout overflows past ~24.8 days and would fire immediately; the DB sweeper covers those.
    if (opts.delayMs > 2 ** 31 - 1) return;
    setTimeout(run, opts.delayMs).unref?.();
  } else setImmediate(run);
}
