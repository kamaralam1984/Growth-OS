import { prisma } from "@/lib/prisma";
import { publishRealtimeEvent, type RealtimeEvent } from "@/lib/realtime/event-bus";
import type { EventLog } from "@/generated/prisma/client";

export type EventLogRow = EventLog;

export interface ListRecentEventsOptions {
  eventType?: string;
  limit?: number;
}

/**
 * Real query against the durable EventLog mirror — most recent first. Not
 * organization-checked beyond the required organizationId filter; callers
 * (Server Actions/pages) are responsible for resolving that id from the
 * caller's own membership, never from client input.
 */
export async function listRecentEvents(
  organizationId: string,
  options?: ListRecentEventsOptions,
): Promise<EventLogRow[]> {
  return prisma.eventLog.findMany({
    where: {
      organizationId,
      ...(options?.eventType ? { eventType: options.eventType } : {}),
    },
    orderBy: { publishedAt: "desc" },
    take: options?.limit ?? 50,
  });
}

const REALTIME_EVENT_KINDS = new Set<RealtimeEvent["kind"]>(["notification", "activity", "agent_status", "comment"]);

function isReplayablePayload(payload: unknown): payload is Omit<RealtimeEvent, "at"> {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Record<string, unknown>;
  return (
    typeof candidate.kind === "string" &&
    REALTIME_EVENT_KINDS.has(candidate.kind as RealtimeEvent["kind"]) &&
    typeof candidate.organizationId === "string" &&
    candidate.organizationId.length > 0
  );
}

/**
 * Genuine replay: looks up the real EventLog row and re-publishes its exact
 * stored payload through publishRealtimeEvent, so any currently-connected
 * SSE client sees it fire a second time. Ownership (does this event belong
 * to the caller's org) is intentionally NOT checked here — the Server Action
 * wrapper must verify that via a membership lookup before calling this.
 */
export async function replayEvent(eventId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await prisma.eventLog.findUnique({ where: { id: eventId } });
  if (!row) return { ok: false, error: "Event not found." };

  if (!isReplayablePayload(row.payload)) {
    return { ok: false, error: "Stored event payload is not replayable." };
  }

  publishRealtimeEvent(row.payload);

  await prisma.eventLog.update({
    where: { id: eventId },
    data: { replayCount: { increment: 1 }, replayedAt: new Date() },
  });

  return { ok: true };
}
