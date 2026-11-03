import { EventEmitter } from "node:events";
import Redis from "ioredis";
import { getRedis } from "./cache";

/**
 * Tiny pub/sub used to push tracking updates from the worker to SSE connections in the web process.
 * Redis when available (cross-process); an in-process emitter otherwise (single-process dev only).
 */

const local = new EventEmitter();
local.setMaxListeners(0);

type Handler = (message: string) => void;
const handlers = new Map<string, Set<Handler>>();

const g = globalThis as unknown as { __redisSub?: Redis | null };
function subscriber(): Redis | null {
  if (g.__redisSub !== undefined) return g.__redisSub;
  const url = process.env.REDIS_URL;
  if (!url) return (g.__redisSub = null);
  const sub = new Redis(url, { maxRetriesPerRequest: null });
  sub.on("error", (e) => console.error("[redis:sub]", e.message));
  sub.on("message", (channel, message) => {
    for (const h of handlers.get(channel) ?? []) h(message);
  });
  return (g.__redisSub = sub);
}

export async function publish(channel: string, message: unknown): Promise<void> {
  const payload = JSON.stringify(message);
  const r = getRedis();
  try {
    if (r) await r.publish(channel, payload);
    else local.emit(channel, payload);
  } catch (e) {
    console.error("[pubsub] publish failed", (e as Error).message);
  }
}

/** Returns an unsubscribe function. */
export function subscribe(channel: string, handler: (message: unknown) => void): () => void {
  const wrapped: Handler = (raw) => {
    try {
      handler(JSON.parse(raw));
    } catch (e) {
      console.error("[pubsub] bad message", (e as Error).message);
    }
  };

  const sub = subscriber();
  if (!sub) {
    local.on(channel, wrapped);
    return () => local.off(channel, wrapped);
  }

  let set = handlers.get(channel);
  if (!set) {
    set = new Set();
    handlers.set(channel, set);
    void sub.subscribe(channel).catch((e) => console.error("[pubsub] subscribe failed", e.message));
  }
  set.add(wrapped);
  return () => {
    set!.delete(wrapped);
    if (set!.size === 0) {
      handlers.delete(channel);
      void sub.unsubscribe(channel).catch(() => {});
    }
  };
}
