import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { ApiErrorBody } from "@fh/domain/flights";
import { rateLimit } from "@fh/api/rate-limit";
import { ProviderError } from "@fh/providers/flights";

export function apiError(status: number, code: string, message: string, extra: Partial<ApiErrorBody["error"]> & Record<string, unknown> = {}) {
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (extra.retryAfterSec) headers["Retry-After"] = String(extra.retryAfterSec);
  return NextResponse.json({ error: { code, message, ...extra } }, { status, headers });
}

export function clientIp(req: NextRequest) {
  // Trustworthy only behind Vercel/Cloudflare, which set these headers themselves.
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
}

/** Returns a 429 response when the caller is over the limit, otherwise null. */
export async function limit(req: NextRequest, bucket: string, max: number, windowSec: number, subject?: string | null) {
  const r = await rateLimit(`${bucket}:${subject ?? clientIp(req)}`, max, windowSec);
  return r.allowed ? null : apiError(429, "RATE_LIMITED", "Too many requests. Please wait a moment.", { retryAfterSec: r.retryAfterSec });
}

/** Maps provider failures to user-safe HTTP errors; vendor details only go to the log. */
export function providerFailure(err: unknown, tag: string) {
  if (err instanceof ProviderError) {
    console.error(`[${tag}] provider error`, { kind: err.kind, ...err.meta, message: err.message });
    switch (err.kind) {
      case "timeout":
        return apiError(504, "UPSTREAM_TIMEOUT", "The search took too long. Please try again.");
      case "rate_limited":
        return apiError(503, "UPSTREAM_BUSY", "We're very busy right now. Please retry shortly.", { retryAfterSec: err.meta.retryAfterSec ?? 2 });
      case "bad_request":
        return apiError(422, "INVALID_SEARCH", "No search could be made for these airports or dates.");
      default:
        return apiError(502, "UPSTREAM_ERROR", "Search is temporarily unavailable.");
    }
  }
  console.error(`[${tag}] unexpected`, err);
  return apiError(500, "INTERNAL", "Something went wrong.");
}
