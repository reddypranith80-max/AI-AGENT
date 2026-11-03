export type ProviderErrorKind = "timeout" | "rate_limited" | "bad_request" | "auth" | "unavailable" | "not_found";

export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
    readonly meta: { status?: number; retryAfterSec?: number; detail?: string } = {},
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function parseRetryAfter(res: Response): number {
  const n = Number(res.headers.get("retry-after"));
  return Number.isFinite(n) && n > 0 ? Math.ceil(n) : 2;
}

/**
 * fetch with timeout, one jittered retry on network/5xx, and error mapping.
 * 429s are never retried (it would deepen the problem); 401 is surfaced to the caller via `onUnauthorized`.
 */
export async function httpJson<T>(
  url: string,
  init: RequestInit,
  opts: {
    timeoutMs: number;
    signal?: AbortSignal;
    vendor: string;
    onUnauthorized?: () => Promise<RequestInit["headers"] | null>;
    allow404?: boolean;
  },
  attempt = 0,
): Promise<T> {
  const signals = [AbortSignal.timeout(opts.timeoutMs), ...(opts.signal ? [opts.signal] : [])];
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.any(signals), cache: "no-store" });
  } catch (err) {
    if (opts.signal?.aborted) throw err; // caller gave up; not our error
    if (err instanceof DOMException && err.name === "TimeoutError")
      throw new ProviderError("timeout", `${opts.vendor} request timed out`);
    if (attempt < 1) {
      await sleep(250 + Math.random() * 250);
      return httpJson<T>(url, init, opts, attempt + 1);
    }
    throw new ProviderError("unavailable", `${opts.vendor} unreachable`);
  }

  if (res.ok) return (await res.json()) as T;

  if (res.status === 401 && attempt < 1 && opts.onUnauthorized) {
    const headers = await opts.onUnauthorized();
    if (headers) return httpJson<T>(url, { ...init, headers }, opts, attempt + 1);
  }
  if (res.status === 429)
    throw new ProviderError("rate_limited", `${opts.vendor} rate limit hit`, {
      status: 429,
      retryAfterSec: parseRetryAfter(res),
    });
  if (res.status === 404 && opts.allow404) throw new ProviderError("not_found", `${opts.vendor} 404`, { status: 404 });
  if (res.status >= 500) {
    if (attempt < 1) {
      await sleep(300 + Math.random() * 300);
      return httpJson<T>(url, init, opts, attempt + 1);
    }
    throw new ProviderError("unavailable", `${opts.vendor} ${res.status}`, { status: res.status });
  }

  const detail = (await res.text().catch(() => "")).slice(0, 500);
  throw new ProviderError(
    res.status === 400 || res.status === 422 ? "bad_request" : res.status === 401 || res.status === 403 ? "auth" : "unavailable",
    `${opts.vendor} ${res.status}`,
    { status: res.status, detail },
  );
}
