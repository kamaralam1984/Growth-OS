import { prisma } from "@/lib/prisma";
import type { MemoryEventType } from "@/generated/prisma/client";

/**
 * Writes one real AgentMemoryEvent row — the audit trail backing the AI
 * Memory Manager's "Memory Timeline". Called from every real mutation to an
 * AgentMemory (create/edit/pin/unpin/archive/restore/delete), never
 * synthesized after the fact.
 *
 * `memoryId` is nullable on the model specifically so a DELETED event
 * survives its own AgentMemory row being hard-deleted (onDelete: SetNull) —
 * callers logging a DELETED event should pass `contentSnapshot` (the
 * decrypted content, since it will otherwise be unrecoverable once the row
 * is gone) so the timeline can still say what was deleted.
 *
 * Like logAudit, this must never break the real mutation it's attached to —
 * failures are swallowed and reported to console.error only.
 */
export async function logMemoryEvent(
  memoryId: string | null,
  agentId: string,
  organizationId: string,
  eventType: MemoryEventType,
  actorUserId?: string | null,
  contentSnapshot?: string | null,
): Promise<void> {
  try {
    await prisma.agentMemoryEvent.create({
      data: {
        memoryId: memoryId ?? undefined,
        agentId,
        organizationId,
        eventType,
        actorUserId: actorUserId ?? undefined,
        contentSnapshot: contentSnapshot ?? undefined,
      },
    });
  } catch (error) {
    console.error("[memory-events] logMemoryEvent failed:", error);
  }
}
