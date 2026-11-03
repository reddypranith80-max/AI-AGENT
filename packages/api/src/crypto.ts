import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * AES-256-GCM for PII at rest (passport numbers). Key: PII_ENCRYPTION_KEY (base64, 32 bytes).
 * In dev a key is derived from AUTH_SECRET so things work out of the box; production must set a real key.
 * Output format: v1.<iv>.<tag>.<ciphertext> (all base64url) so the scheme can be rotated later.
 */
function key(): Buffer {
  const raw = process.env.PII_ENCRYPTION_KEY;
  if (raw) {
    const k = Buffer.from(raw, "base64");
    if (k.length !== 32) throw new Error("PII_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
    return k;
  }
  if (process.env.NODE_ENV === "production") throw new Error("PII_ENCRYPTION_KEY is required in production");
  return createHash("sha256").update(process.env.AUTH_SECRET ?? "dev-only-secret").digest();
}

export function encryptPii(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptPii(token: string): string {
  const [v, iv, tag, ct] = token.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Unsupported ciphertext");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}
