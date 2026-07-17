"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { logAudit } from "@/lib/audit";
import { resolveActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { createTicket, respondToTicket, escalateTicket, resolveTicket, suggestFaqAnswer } from "@/lib/support/tickets";
import type { MessagePriority } from "@/generated/prisma/client";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export async function createTicketAction(input: { subject: string; description?: string; priority?: MessagePriority; companyId?: string }): Promise<ActionResult & { taskId?: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };
  if (!input.subject.trim()) return { ok: false, error: "Give the ticket a subject." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  const ticket = await createTicket({ organizationId: membership.organizationId, subject: input.subject, description: input.description, priority: input.priority, companyId: input.companyId });
  await logAudit({ userId, organizationId: membership.organizationId, action: "support.ticket_created", metadata: { taskId: ticket.id } });
  revalidatePath("/dashboard/support");
  return { ok: true, taskId: ticket.id };
}

export async function respondToTicketAction(taskId: string, content: string, isInternalNote: boolean): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };
  if (!content.trim()) return { ok: false, error: "Write a real response first." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  try {
    await respondToTicket(taskId, membership.organizationId, userId, content, isInternalNote);
    revalidatePath(`/dashboard/support/${taskId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not respond." };
  }
}

export async function escalateTicketAction(taskId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };
  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  try {
    await escalateTicket(taskId, membership.organizationId);
    revalidatePath(`/dashboard/support/${taskId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not escalate." };
  }
}

export async function resolveTicketAction(taskId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };
  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  try {
    await resolveTicket(taskId, membership.organizationId);
    revalidatePath(`/dashboard/support/${taskId}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not resolve." };
  }
}

export async function suggestFaqAnswerAction(taskId: string): Promise<ActionResult & { articleTitle?: string | null; suggestedAnswer?: string; confidenceScore?: number }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };
  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  try {
    const result = await suggestFaqAnswer(taskId, membership.organizationId);
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not suggest an answer." };
  }
}
