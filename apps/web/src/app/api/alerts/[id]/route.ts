import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AlertError, deletePriceAlert, setAlertActive } from "@fh/api/alerts";
import { apiError } from "@/lib/api";
import { getUserId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return apiError(401, "UNAUTHENTICATED", "Please sign in.");
  const { id } = await ctx.params;
  const body = z.object({ active: z.boolean() }).safeParse(await req.json().catch(() => null));
  if (!idSchema.safeParse(id).success || !body.success) return apiError(400, "INVALID_REQUEST", "Invalid request.");
  try {
    await setAlertActive(userId, id, body.data.active);
    return NextResponse.json({ data: { id, active: body.data.active } });
  } catch (err) {
    if (err instanceof AlertError) return apiError(404, err.code, err.message);
    throw err;
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return apiError(401, "UNAUTHENTICATED", "Please sign in.");
  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) return apiError(400, "INVALID_REQUEST", "Invalid request.");
  try {
    await deletePriceAlert(userId, id);
    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof AlertError) return apiError(404, err.code, err.message);
    throw err;
  }
}
