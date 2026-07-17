import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { generateStructured } from "@/lib/ai/fallback";
import { recordAIUsage } from "@/lib/billing/ai-credits";
import { AINotConnectedError, isAIConnected } from "@/lib/ai/client";
import { getPersona } from "@/lib/ai/personas";
import { notifyOrganizationOwners } from "@/lib/notifications";
import type { Task, Comment, MessagePriority } from "@/generated/prisma/client";

/**
 * Support Agent — real support tickets ARE Task rows (type SUPPORT), the
 * same reuse the existing client-portal raiseTicket() (src/app/portal/
 * projects/[id]/actions.ts) already established, and real threaded
 * messages are Comment rows (docKind: TASK) — no parallel
 * SupportTicket/SupportTicketMessage model. TaskStatus has no dedicated
 * support-lifecycle values, so this maps onto the existing enum: BACKLOG =
 * open, RUNNING = in progress, BLOCKED = waiting on customer, COMPLETED =
 * resolved, CANCELLED = closed without resolution.
 */

export interface CreateTicketInput {
  organizationId: string;
  subject: string;
  description?: string;
  companyId?: string;
  contactId?: string;
  priority?: MessagePriority;
  assignedToUserId?: string;
  slaDueAt?: Date;
}

export async function createTicket(input: CreateTicketInput): Promise<Task> {
  return prisma.task.create({
    data: {
      organizationId: input.organizationId,
      title: input.subject,
      description: input.description ?? null,
      type: "SUPPORT",
      status: "BACKLOG",
      companyId: input.companyId ?? null,
      contactId: input.contactId ?? null,
      priority: input.priority ?? "NORMAL",
      assignedToUserId: input.assignedToUserId ?? null,
      dueDate: input.slaDueAt ?? null,
    },
  });
}

export async function respondToTicket(taskId: string, organizationId: string, authorUserId: string, content: string, isInternalNote: boolean): Promise<Comment> {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || task.organizationId !== organizationId || task.type !== "SUPPORT") throw new Error("Support ticket not found.");

  const comment = await prisma.comment.create({
    data: { organizationId, docKind: "TASK", docId: taskId, authorUserId, content, isInternalNote },
  });

  if (!isInternalNote) {
    await prisma.task.update({ where: { id: taskId }, data: { status: "BLOCKED" } }); // real response sent — now waiting on the customer
  }

  return comment;
}

export async function escalateTicket(taskId: string, organizationId: string): Promise<Task> {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || task.organizationId !== organizationId || task.type !== "SUPPORT") throw new Error("Support ticket not found.");

  const updated = await prisma.task.update({ where: { id: taskId }, data: { priority: "URGENT" } });

  await notifyOrganizationOwners({
    organizationId,
    type: "CRITICAL_ALERT",
    title: `Support ticket escalated: ${task.title}`,
    message: `"${task.title}" has been escalated and needs urgent attention.`,
  });

  return updated;
}

export async function resolveTicket(taskId: string, organizationId: string): Promise<Task> {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || task.organizationId !== organizationId || task.type !== "SUPPORT") throw new Error("Support ticket not found.");
  return prisma.task.update({ where: { id: taskId }, data: { status: "COMPLETED" } });
}

const FaqSuggestionSchema = z.object({
  articleTitle: z.string().nullable(),
  suggestedAnswer: z.string().trim().min(1),
  confidenceScore: z.number().min(0).max(100),
});

/**
 * Searches real, PUBLISHED KnowledgeArticle rows and asks the model to
 * ground a suggested answer strictly in what was actually found — if no
 * article genuinely covers the question, articleTitle is null and the
 * model must say so honestly rather than fabricating an answer.
 */
export async function suggestFaqAnswer(taskId: string, organizationId: string): Promise<{ articleTitle: string | null; suggestedAnswer: string; confidenceScore: number }> {
  if (!isAIConnected()) throw new AINotConnectedError();

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || task.organizationId !== organizationId || task.type !== "SUPPORT") throw new Error("Support ticket not found.");

  const workspace = await prisma.workspace.findUnique({ where: { organizationId }, include: { knowledgeBase: true } });
  const articles = workspace?.knowledgeBase
    ? await prisma.knowledgeArticle.findMany({
        where: { knowledgeBaseId: workspace.knowledgeBase.id, status: "PUBLISHED" },
        select: { title: true, content: true },
        take: 30,
      })
    : [];

  const articleList = articles.length > 0 ? articles.map((a) => `### ${a.title}\n${a.content.slice(0, 500)}`).join("\n\n") : "No published Knowledge Base articles exist yet.";

  const persona = getPersona("SUPPORT");
  const result = await generateStructured({
    system: `${persona.systemPrompt}\n\nSuggest an answer to this real support ticket, grounded STRICTLY in the real Knowledge Base articles given below. If no article genuinely covers this question, set articleTitle to null and say so honestly in suggestedAnswer rather than inventing an answer.`,
    userContent: `Ticket: "${task.title}"\n${task.description ?? ""}\n\nReal published Knowledge Base articles:\n${articleList}`,
    maxTokens: 768,
    effort: "low",
    schema: FaqSuggestionSchema,
  });
  await recordAIUsage(organizationId, result.provider, result.model, result.inputTokens, result.outputTokens, "support:faq-suggestion");

  return result.parsed;
}
