import { EventEmitter } from "node:events";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export interface RealtimeEvent {
  kind: "notification" | "activity" | "agent_status" | "comment" | "company_discovery_progress";
  organizationId: string;
  /** Set on "comment" events so a project-scoped subscriber (e.g. the Client Portal SSE route) can filter the shared per-organization channel down to a single project's thread. */
  projectId?: string;
  at: number;
}

/**
 * Module-scoped in-memory event bus — real push behavior within a single
 * Node process, but NOT shared across multiple instances/replicas (no Redis
 * or other broker in this environment). A horizontally-scaled production
 * deployment would need to swap this for a shared pub/sub backend behind the
 * same publish/subscribe signature; documented limitation, not a fake
 * "realtime" that silently does nothing under scale-out.
 */
const emitter = new EventEmitter();
emitter.setMaxListeners(0);

/**
 * Durable mirror of every published event into EventLog, so history survives
 * past whatever's currently listening on the in-memory emitter and can be
 * replayed later (see src/lib/realtime/event-log.ts). Fire-and-forget and
 * never throws — same discipline as logActivity/notifyUser — a DB write
 * failure here must never break the (already-delivered) in-memory publish.
 */
async function persistEventLog(event: RealtimeEvent): Promise<void> {
  if (!event.organizationId) {
    console.warn("[event-bus] skipping EventLog write — event has no organizationId:", event.kind);
    return;
  }
  try {
    await prisma.eventLog.create({
      data: {
        organizationId: event.organizationId,
        eventType: event.kind,
        payload: event as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    console.error("[event-bus] failed to write EventLog row:", error);
  }
}

export function publishRealtimeEvent(event: Omit<RealtimeEvent, "at">): void {
  const fullEvent = { ...event, at: Date.now() } satisfies RealtimeEvent;
  emitter.emit(event.organizationId, fullEvent);
  void persistEventLog(fullEvent);
}

export function subscribeRealtimeEvents(
  organizationId: string,
  handler: (event: RealtimeEvent) => void,
): () => void {
  emitter.on(organizationId, handler);
  return () => emitter.off(organizationId, handler);
}
