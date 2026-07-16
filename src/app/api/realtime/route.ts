import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { subscribeRealtimeEvents } from "@/lib/realtime/event-bus";

export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 25_000;

const querySchema = z.object({ orgId: z.string().trim().min(1) });

/**
 * Authenticated Server-Sent Events stream for the caller's active
 * organization — real push notifications for the Live AI Panel/Timeline,
 * Notification Bell, and Activity Bar. Single-instance in-memory event bus
 * (see src/lib/realtime/event-bus.ts); documented limitation if this app is
 * later deployed across multiple Node instances.
 */
export async function GET(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const parsedQuery = querySchema.safeParse({ orgId: url.searchParams.get("orgId") });
  if (!parsedQuery.success) {
    return new Response("Missing orgId", { status: 400 });
  }
  const { orgId: organizationId } = parsedQuery.data;

  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
  });
  if (!membership || membership.status !== "ACTIVE") {
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

      unsubscribe = subscribeRealtimeEvents(organizationId, (event) => {
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
