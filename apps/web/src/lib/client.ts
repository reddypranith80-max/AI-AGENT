import type { ApiErrorBody } from "@fh/domain/flights";

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number, // 0 = network failure
    readonly retryAfterSec?: number,
    readonly issues?: Record<string, string[] | undefined>,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
  /** Worth retrying automatically: transient upstream/network trouble. */
  get retryable() {
    return [0, 502, 503, 504].includes(this.status);
  }
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    if (init?.signal?.aborted) throw err; // let React Query treat it as a cancellation
    throw new ApiClientError("Network error. Check your connection.", "NETWORK", 0);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as (ApiErrorBody & { error: { details?: Record<string, unknown> } }) | null;
    throw new ApiClientError(
      body?.error.message ?? "Something went wrong",
      body?.error.code ?? "UNKNOWN",
      res.status,
      body?.error.retryAfterSec,
      body?.error.issues,
      body?.error.details,
    );
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

/** Flattens `{ field: ["msg"] }` issues into `{ field: "msg" }` for form display. */
export const firstIssues = (issues?: Record<string, string[] | undefined>) =>
  Object.fromEntries(Object.entries(issues ?? {}).flatMap(([k, v]) => (v?.[0] ? [[k, v[0]]] : [])));
