import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getClientPortalSession } from "@/lib/client-portal/auth";
import { subscribeRealtimeEvents } from "@/lib/realtime/event-bus";

export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 25_000;

const querySchema = z.object({ projectId: z.string().trim().min(1) });

/**
 * Client-Portal-scoped SSE stream for a single project's comments/tickets
 * thread — mirrors src/app/api/realtime/route.ts's mechanism (same
 * event-bus, same single-instance in-memory limitation, see
 * src/lib/realtime/event-bus.ts) but authenticates via the Client Portal's
 * own session (ClientSession cookie via getClientPortalSession(), never
 * Auth.js) so an internal-team session can never open this stream and vice
 * versa.
 *
 * The underlying event-bus channel is keyed by organizationId only, so it
 * carries "comment" events for every client under that org — a
 * client-supplied projectId query param is therefore never trusted on its
 * own. It's resolved against a real Project row and checked server-side
 * against this session's own Client before the stream opens, and every
 * event received off the channel is filtered by that verified projectId
 * before being forwarded, so a portal user can only ever see activity on
 * their own project's thread.
 */
export async function GET(request: Request) {
  const session = await getClientPortalSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const parsedQuery = querySchema.safeParse({ projectId: url.searchParams.get("projectId") });
  if (!parsedQuery.success) {
    return new Response("Missing projectId", { status: 400 });
  }
  const { projectId } = parsedQuery.data;

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, clientId: true } });
  if (!project || project.clientId !== session.client.id) {
    return new Response("Forbidden", { status: 403 });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          // Controller already closed (client disconnected) — ignore.
        }
      };

      send(`retry: 3000\n\n`);

      unsubscribe = subscribeRealtimeEvents(session.organizationId, (event) => {
        if (event.kind !== "comment" || event.projectId !== projectId) return;
        send(`data: ${JSON.stringify(event)}\n\n`);
      });

      heartbeat = setInterval(() => send(`: heartbeat\n\n`), HEARTBEAT_MS);

      request.signal.addEventListener("abort", () => {
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe?.();
        try {
          controller.close();
        } catch {
          // Already closed — ignore.
        }
      });
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
