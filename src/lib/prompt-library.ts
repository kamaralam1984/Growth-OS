import { prisma } from "@/lib/prisma";
import type { PromptTemplate, AgentType } from "@/generated/prisma/client";

/**
 * First-class CRUD for PromptTemplate — a standalone tenant deliverable in
 * its own right (Prompt Library UI, src/app/dashboard/prompt-library/), not
 * only an install target for Prompt Pack marketplace listings.
 */

export interface CreatePromptTemplateInput {
  organizationId: string;
  title: string;
  promptText: string;
  description?: string | null;
  category?: string | null;
  variables?: string[];
  agentType?: AgentType | null;
  sourceListingId?: string | null;
  createdByUserId?: string | null;
}

export async function createPromptTemplate(input: CreatePromptTemplateInput): Promise<PromptTemplate> {
  return prisma.promptTemplate.create({
    data: {
      organizationId: input.organizationId,
      title: input.title,
      promptText: input.promptText,
      description: input.description ?? null,
      category: input.category ?? null,
      variables: input.variables ?? [],
      agentType: input.agentType ?? null,
      sourceListingId: input.sourceListingId ?? null,
      createdByUserId: input.createdByUserId ?? null,
    },
  });
}

export async function listPromptTemplates(organizationId: string, category?: string): Promise<PromptTemplate[]> {
  return prisma.promptTemplate.findMany({
    where: { organizationId, ...(category ? { category } : {}) },
    orderBy: { createdAt: "desc" },
  });
}

export interface UpdatePromptTemplateInput {
  title?: string;
  promptText?: string;
  description?: string | null;
  category?: string | null;
  variables?: string[];
  agentType?: AgentType | null;
}

/** Ownership-checked: scoped to organizationId, not a bare id. */
export async function updatePromptTemplate(promptTemplateId: string, organizationId: string, input: UpdatePromptTemplateInput): Promise<PromptTemplate> {
  const existing = await prisma.promptTemplate.findUnique({ where: { id: promptTemplateId } });
  if (!existing || existing.organizationId !== organizationId) throw new Error("Prompt template not found.");
  return prisma.promptTemplate.update({ where: { id: promptTemplateId }, data: input });
}

/** Ownership-checked: scoped to organizationId, not a bare id. */
export async function deletePromptTemplate(promptTemplateId: string, organizationId: string): Promise<void> {
  const existing = await prisma.promptTemplate.findUnique({ where: { id: promptTemplateId } });
  if (!existing || existing.organizationId !== organizationId) throw new Error("Prompt template not found.");
  await prisma.promptTemplate.delete({ where: { id: promptTemplateId } });
}
