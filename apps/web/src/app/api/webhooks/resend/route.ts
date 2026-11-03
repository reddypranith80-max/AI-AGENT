import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@fh/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Svix signature check (Resend webhooks): HMAC-SHA256 over `${id}.${timestamp}.${body}` with the base64 secret. */
function verify(body: string, headers: Headers): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const id = headers.get("svix-id");
  const ts = headers.get("svix-timestamp");
  const sigs = headers.get("svix-signature");
  if (!secret || !id || !ts || !sigs) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 5 * 60) return false; // replay window
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest();
  return sigs.split(" ").some((s) => {
    const [, v] = s.split(",");
    if (!v) return false;
    const given = Buffer.from(v, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

type ResendEvent = { type: string; data: { email_id?: string; to?: string[] } };

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verify(raw, req.headers)) return new Response("invalid signature", { status: 401 });

  const eventId = req.headers.get("svix-id")!;
  // Idempotent: Resend retries on non-2xx.
  const seen = await prisma.processedWebhookEvent.createMany({ data: [{ source: "resend", eventId }], skipDuplicates: true });
  if (seen.count === 0) return new Response("ok");

  const evt = JSON.parse(raw) as ResendEvent;
  const email = evt.data.to?.[0]?.toLowerCase();

  if (evt.type === "email.bounced" || evt.type === "email.complained") {
    if (email)
      await prisma.emailSuppression.upsert({
        where: { email },
        create: { email, reason: evt.type === "email.bounced" ? "BOUNCE" : "COMPLAINT" },
        update: {},
      });
    if (evt.data.email_id)
      await prisma.notification.updateMany({ where: { providerMessageId: evt.data.email_id }, data: { status: "BOUNCED" } });
  }
  return new Response("ok");
}
