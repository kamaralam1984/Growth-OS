"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { replayEvent } from "@/lib/realtime/event-log";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const PRIVILEGED_ROLES = new Set(["OWNER", "ADMIN"]);

async function requirePrivileged(): Promise<ActionResult & { organizationId?: string; userId?: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };
  const membership = await prisma.membership.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };
  if (!PRIVILEGED_ROLES.has(membership.role)) return { ok: false, error: "Only owners and admins can replay events." };
  return { ok: true, organizationId: membership.organizationId, userId };
}

export async function replayEventAction(eventId: string): Promise<ActionResult> {
  const access = await requirePrivileged();
  if (!access.ok || !access.organizationId || !access.userId) return access;

  const event = await prisma.eventLog.findUnique({ where: { id: eventId }, select: { organizationId: true } });
  if (!event) return { ok: false, error: "Event not found." };
  if (event.organizationId !== access.organizationId) return { ok: false, error: "You don't have access to this event." };

  const result = await replayEvent(eventId);
  if (!result.ok) return result;

  await logAudit({ userId: access.userId, organizationId: access.organizationId, action: "event.replayed", metadata: { eventId } });
  revalidatePath("/dashboard/settings/events");
  return { ok: true };
}
