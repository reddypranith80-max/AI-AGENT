import type { NextRequest } from "next/server";
import { prisma } from "@fh/db";
import { verifyUnsubscribeToken } from "@fh/api/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const page = (title: string, body: string, status = 200) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark">
<title>${title}</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:28rem;margin:18vh auto;padding:0 1.25rem}h1{font-size:1.25rem}p{color:#71717a}a{color:#4f46e5}</style>
<h1>${title}</h1><p>${body}</p><p><a href="/">Back to Flight Hotel</a></p>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );

const FIELD = { booking: "bookingEmail", price: "priceAlerts", status: "flightStatus" } as const;
const LABEL = { booking: "booking emails", price: "price alerts", status: "flight status updates", all: "all optional emails" } as const;

async function apply(token: string | null) {
  const t = token ? verifyUnsubscribeToken(token) : null;
  if (!t) return null;
  const off =
    t.category === "all"
      ? { priceAlerts: false, flightStatus: false }
      : { [FIELD[t.category]]: false };
  await prisma.notificationPreference.upsert({ where: { userId: t.userId }, create: { userId: t.userId, ...off }, update: off });
  return t.category;
}

// Link click in the email footer.
export async function GET(req: NextRequest) {
  const category = await apply(req.nextUrl.searchParams.get("token"));
  if (!category) return page("Link not valid", "This unsubscribe link is invalid or has been altered.", 400);
  return page("You're unsubscribed", `You won't receive ${LABEL[category]} any more. You can turn them back on in your account settings.`);
}

// RFC 8058 one-click unsubscribe (List-Unsubscribe-Post) sent by mail clients.
export async function POST(req: NextRequest) {
  const category = await apply(req.nextUrl.searchParams.get("token"));
  return new Response(null, { status: category ? 200 : 400 });
}
