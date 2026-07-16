"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createTask } from "@/app/board/tasks/actions";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function resolveActiveMembership(userId: string) {
  return prisma.membership.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
}

/** Creates a real, self-assigned follow-up Task linked to the contact — reuses board/tasks/actions.ts's createTask verbatim, same OWNER/ADMIN gate it already enforces. */
export async function createFollowUpTask(contactId: string, title: string, dueDate?: Date): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact || contact.organizationId !== membership.organizationId) return { ok: false, error: "Contact not found." };

  return createTask({ title, assignedToUserId: userId, contactId, dueDate });
}
