"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { createPromptTemplate, updatePromptTemplate, deletePromptTemplate } from "@/lib/prompt-library";
import type { AgentType } from "@/generated/prisma/client";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function resolveActiveMembership(userId: string) {
  return prisma.membership.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
}

export interface CreatePromptInput {
  title: string;
  promptText: string;
  description?: string;
  category?: string;
  variables?: string[];
  agentType?: AgentType | "";
}

export async function createPromptAction(input: CreatePromptInput): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };
  if (!input.title.trim()) return { ok: false, error: "Give the prompt a title." };
  if (!input.promptText.trim()) return { ok: false, error: "The prompt needs real text." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  const prompt = await createPromptTemplate({
    organizationId: membership.organizationId,
    title: input.title.trim(),
    promptText: input.promptText.trim(),
    description: input.description?.trim() || null,
    category: input.category?.trim() || null,
    variables: input.variables ?? [],
    agentType: input.agentType || null,
    createdByUserId: userId,
  });

  await logAudit({ userId, organizationId: membership.organizationId, action: "prompt_library.created", metadata: { promptId: prompt.id } });
  revalidatePath("/dashboard/prompt-library");
  return { ok: true };
}

export async function deletePromptAction(promptId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  try {
    await deletePromptTemplate(promptId, membership.organizationId);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not delete prompt." };
  }

  await logAudit({ userId, organizationId: membership.organizationId, action: "prompt_library.deleted", metadata: { promptId } });
  revalidatePath("/dashboard/prompt-library");
  return { ok: true };
}

export interface UpdatePromptInput {
  title?: string;
  promptText?: string;
  description?: string | null;
  category?: string | null;
}

export async function updatePromptAction(promptId: string, input: UpdatePromptInput): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  try {
    await updatePromptTemplate(promptId, membership.organizationId, input);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not update prompt." };
  }

  revalidatePath("/dashboard/prompt-library");
  return { ok: true };
}
