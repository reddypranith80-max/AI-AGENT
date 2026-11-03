import { NextResponse, type NextRequest } from "next/server";
import { createPriceAlertSchema } from "@fh/domain/alerts";
import { AlertError, createPriceAlert, listPriceAlerts } from "@fh/api/alerts";
import { ProviderError } from "@fh/providers/flights";
import { apiError, limit, providerFailure } from "@/lib/api";
import { getUserId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return apiError(401, "UNAUTHENTICATED", "Please sign in.");
  return NextResponse.json({ data: await listPriceAlerts(userId) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return apiError(401, "UNAUTHENTICATED", "Please sign in.");
  const limited = await limit(req, "alerts", 10, 60, userId);
  if (limited) return limited;

  const parsed = createPriceAlertSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "INVALID_REQUEST", "Please check the alert details.", { issues: parsed.error.flatten().fieldErrors });

  try {
    return NextResponse.json({ data: await createPriceAlert(userId, parsed.data) }, { status: 201 });
  } catch (err) {
    if (err instanceof AlertError) return apiError(err.code === "LIMIT" ? 409 : 404, err.code, err.message);
    if (err instanceof ProviderError) return providerFailure(err, "alerts");
    console.error("[alerts] unexpected", err);
    return apiError(500, "INTERNAL", "Something went wrong.");
  }
}
