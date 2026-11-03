import type { NextRequest } from "next/server";
import { z } from "zod";
import { trackingChannel, type TrackingStreamMessage } from "@fh/domain/tracking";
import { subscribe } from "@fh/api/pubsub";
import { TrackingError, getTrackedFlightView, pollFlightInstance, stopTracking, trackBooking, userCanViewFlight } from "@fh/api/tracking";
import { apiError } from "@/lib/api";
import { getUserId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // the client's EventSource reconnects automatically after we close

const HEARTBEAT_MS = 15_000;
const MAX_STREAM_MS = 4 * 60_000;
const hasWorker = () => Boolean(process.env.REDIS_URL);

/**
 * Server-Sent Events for live tracking. `id` is either a flight-instance id the user tracks,
 * or a booking id (streams every segment of the booking; messages carry `flightInstanceId`).
 *
 * Messages: snapshot (full state on connect) · position · status (full state after a change) · end.
 * Updates arrive instantly via pub/sub from the worker; a slow DB re-check is the safety net.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return apiError(401, "UNAUTHENTICATED", "Please sign in.");
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return apiError(400, "INVALID_ID", "Invalid id.");

  let ids: string[];
  try {
    ids = (await userCanViewFlight(userId, id)) ? [id] : (await trackBooking(userId, id)).map((s) => s.flightInstanceId);
  } catch (err) {
    if (err instanceof TrackingError) return apiError(404, err.code, "Nothing to track here.");
    throw err;
  }

  const enc = new TextEncoder();
  const cleanups: (() => void)[] = [];
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (msg: TrackingStreamMessage) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(`event: ${msg.type}\ndata: ${JSON.stringify(msg)}\n\n`));
        } catch {
          close();
        }
      };
      const comment = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(`: ${text}\n\n`));
        } catch {
          close();
        }
      };
      const done = new Set<string>();
      const close = () => {
        if (closed) return;
        closed = true;
        cleanups.forEach((fn) => fn());
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener("abort", close);
      controller.enqueue(enc.encode("retry: 5000\n\n"));

      const fingerprints = new Map<string, string>();
      const fp = (v: Awaited<ReturnType<typeof getTrackedFlightView>>) =>
        [v.status, v.depGate, v.arrGate, v.delayMinutes, v.baggageBelt, v.events[0]?.id, v.position?.recordedAt].join("|");

      for (const flightId of ids) {
        const view = await getTrackedFlightView(flightId);
        fingerprints.set(flightId, fp(view));
        send({ type: "snapshot", flight: view });
        if (view.done) done.add(flightId);

        cleanups.push(
          subscribe(trackingChannel(flightId), (m) => {
            const msg = m as TrackingStreamMessage;
            send(msg);
            if (msg.type === "end") {
              done.add(flightId);
              if (done.size === ids.length) setTimeout(close, 500);
            }
          }),
        );
      }
      if (done.size === ids.length) {
        for (const flightId of ids) send({ type: "end", flightInstanceId: flightId, reason: "LANDED" });
        setTimeout(close, 500);
        return;
      }

      // Heartbeat keeps proxies from idling the connection out.
      const hb = setInterval(() => comment("ping"), HEARTBEAT_MS);
      cleanups.push(() => clearInterval(hb));

      // Safety net: re-read from the DB (and, with no worker running in local dev, poll the provider ourselves).
      let lastLazyPoll = 0;
      const sweep = setInterval(async () => {
        for (const flightId of ids) {
          if (done.has(flightId) || closed) continue;
          try {
            if (!hasWorker() && Date.now() - lastLazyPoll > 45_000) {
              lastLazyPoll = Date.now();
              await pollFlightInstance(flightId);
            }
            const view = await getTrackedFlightView(flightId);
            const next = fp(view);
            if (next !== fingerprints.get(flightId)) {
              fingerprints.set(flightId, next);
              send({ type: "status", flight: view });
              if (view.position) send({ type: "position", flightInstanceId: flightId, position: view.position });
            }
          } catch (e) {
            console.error("[track:sse] sweep failed", (e as Error).message);
          }
        }
      }, hasWorker() ? 20_000 : 5_000);
      cleanups.push(() => clearInterval(sweep));

      const cap = setTimeout(close, MAX_STREAM_MS);
      cleanups.push(() => clearTimeout(cap));
    },
    cancel() {
      closed = true;
      cleanups.forEach((fn) => fn());
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable nginx buffering
    },
  });
}

/** Stop tracking a flight (no more updates or emails; polling ends when nobody is watching). */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const userId = await getUserId();
  if (!userId) return apiError(401, "UNAUTHENTICATED", "Please sign in.");
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return apiError(400, "INVALID_ID", "Invalid id.");
  await stopTracking(userId, id);
  return new Response(null, { status: 204 });
}
