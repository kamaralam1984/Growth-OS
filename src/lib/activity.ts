import { prisma } from "@/lib/prisma";
import { publishRealtimeEvent } from "@/lib/realtime/event-bus";
import type { ActivityType, Prisma } from "@/generated/prisma/client";

export interface LogActivityInput {
  organizationId: string;
  type: ActivityType;
  description: string;
  actorAgentId?: string | null;
  actorUserId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Thin wrapper around Activity creation — powers the unified org-wide
 * timeline (meetings, agent messages, task updates, completed work, etc).
 * Like logAudit, this must never break the calling action: failures are
 * swallowed and reported via console.error only.
 */
export async function logActivity(input: LogActivityInput): Promise<void> {
  try {
    await prisma.activity.create({
      data: {
        organizationId: input.organizationId,
        type: input.type,
        description: input.description,
        actorAgentId: input.actorAgentId ?? undefined,
        actorUserId: input.actorUserId ?? undefined,
        metadata: (input.metadata as Prisma.InputJsonValue | undefined) ?? undefined,
      },
    });
    publishRealtimeEvent({ kind: "activity", organizationId: input.organizationId });
  } catch (error) {
    console.error("[activity] failed to write activity log:", error);
  }
}
