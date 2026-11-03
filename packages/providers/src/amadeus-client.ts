import { ProviderError, httpJson } from "./errors";

export type AmadeusConfig = { clientId: string; clientSecret: string; baseUrl: string; timeoutMs?: number };

/** Shared OAuth + transport for the Amadeus Flight and Hotel adapters. */
export class AmadeusClient {
  private token: { value: string; expiresAt: number } | null = null;
  private tokenInflight: Promise<string> | null = null;
  private readonly timeoutMs: number;

  constructor(private readonly cfg: AmadeusConfig) {
    this.timeoutMs = cfg.timeoutMs ?? 10_000;
  }

  static fromEnv() {
    const { AMADEUS_CLIENT_ID, AMADEUS_CLIENT_SECRET, AMADEUS_BASE_URL } = process.env;
    if (!AMADEUS_CLIENT_ID || !AMADEUS_CLIENT_SECRET) throw new Error("Amadeus credentials are not configured");
    return new AmadeusClient({
      clientId: AMADEUS_CLIENT_ID,
      clientSecret: AMADEUS_CLIENT_SECRET,
      baseUrl: AMADEUS_BASE_URL ?? "https://test.api.amadeus.com",
    });
  }

  async request<T>(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<T> {
    const auth = async (): Promise<Record<string, string>> => ({
      ...(init.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${await this.getToken()}`,
    });
    return httpJson<T>(
      this.cfg.baseUrl + path,
      { ...init, headers: await auth() },
      {
        timeoutMs: this.timeoutMs,
        signal,
        vendor: "Amadeus",
        onUnauthorized: async () => {
          this.token = null; // revoked/expired early → refresh once
          return auth();
        },
      },
    );
  }

  private async getToken(): Promise<string> {
    if (this.token && this.token.expiresAt - 60_000 > Date.now()) return this.token.value;
    // Single-flight so a burst of cold requests triggers one auth call.
    this.tokenInflight ??= this.fetchToken().finally(() => {
      this.tokenInflight = null;
    });
    return this.tokenInflight;
  }

  private async fetchToken(): Promise<string> {
    let res: Response;
    try {
      res = await fetch(`${this.cfg.baseUrl}/v1/security/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: this.cfg.clientId,
          client_secret: this.cfg.clientSecret,
        }),
        signal: AbortSignal.timeout(5_000),
        cache: "no-store",
      });
    } catch {
      throw new ProviderError("unavailable", "Amadeus auth unreachable");
    }
    if (!res.ok) throw new ProviderError("auth", `Amadeus auth failed (${res.status})`, { status: res.status });
    const j = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: j.access_token, expiresAt: Date.now() + j.expires_in * 1000 };
    return j.access_token;
  }
}
