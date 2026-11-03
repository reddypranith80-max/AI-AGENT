import Redis from "ioredis";

// Redis when REDIS_URL is set, otherwise a bounded in-memory Map (dev / single instance).
// Every operation fails open: a cache outage must degrade latency, never availability.

const memory = new Map<string, { value: string; expiresAt: number }>();
const MAX_MEMORY_KEYS = 1000;

const g = globalThis as unknown as { __redis?: Redis | null };

/** Shared Redis connection (null when REDIS_URL is unset). Survives Next dev HMR. */
export function getRedis(): Redis | null {
  if (g.__redis !== undefined) return g.__redis;
  const url = process.env.REDIS_URL;
  if (!url) return (g.__redis = null);
  const r = new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false, connectTimeout: 2_000 });
  r.on("error", (e) => console.error("[redis]", e.message));
  return (g.__redis = r);
}

function memGet(key: string): string | null {
  const e = memory.get(key);
  if (!e) return null;
  if (e.expiresAt < Date.now()) {
    memory.delete(key);
    return null;
  }
  return e.value;
}
function memSet(key: string, value: string, ttlSec: number) {
  if (memory.size >= MAX_MEMORY_KEYS) {
    const oldest = memory.keys().next().value;
    if (oldest !== undefined) memory.delete(oldest);
  }
  memory.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const r = getRedis();
    const raw = r ? await r.get(key) : memGet(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (e) {
    console.error("[cache] get failed", (e as Error).message);
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSec: number): Promise<void> {
  try {
    const raw = JSON.stringify(value);
    const r = getRedis();
    if (r) await r.set(key, raw, "EX", ttlSec);
    else memSet(key, raw, ttlSec);
  } catch (e) {
    console.error("[cache] set failed", (e as Error).message);
  }
}

export async function cacheDel(key: string): Promise<void> {
  try {
    const r = getRedis();
    if (r) await r.del(key);
    else memory.delete(key);
  } catch (e) {
    console.error("[cache] del failed", (e as Error).message);
  }
}

/** Returns the new counter value, or 0 on failure (callers treat 0 as "allowed"). */
export async function cacheIncr(key: string, ttlSec: number): Promise<number> {
  try {
    const r = getRedis();
    if (r) {
      const n = await r.incr(key);
      if (n === 1) await r.expire(key, ttlSec);
      return n;
    }
    const n = Number(memGet(key) ?? 0) + 1;
    memSet(key, String(n), ttlSec);
    return n;
  } catch (e) {
    console.error("[cache] incr failed", (e as Error).message);
    return 0;
  }
}
