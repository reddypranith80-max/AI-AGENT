import { cacheIncr } from "./cache";

/** Fixed-window limiter. The window id is part of the key, so a lost TTL can never lock anyone out. */
export async function rateLimit(key: string, limit: number, windowSec: number) {
  const now = Date.now();
  const win = Math.floor(now / (windowSec * 1000));
  const count = await cacheIncr(`rl:${key}:${win}`, windowSec + 1);
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSec: Math.max(1, Math.ceil(((win + 1) * windowSec * 1000 - now) / 1000)),
  };
}
