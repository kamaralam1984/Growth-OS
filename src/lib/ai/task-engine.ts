import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { prisma } from "@/lib/prisma";
import { AGENT_MODEL, AINotConnectedError, getAnthropicClient, isAIConnected } from "@/lib/ai/client";

const TaskSuggestionSchema = z.object({
  suggestions: z
    .array(
      z.object({
        taskId: z.string(),
        title: z.string(),
        reasoning: z.string(),
        suggestedPriority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]),
        isBlocked: z.boolean(),
        blockedReason: z.string().optional(),
        automationOpportunity: z.string().optional(),
      }),
    )
    .max(10),
  nextBestAction: z.string(),
});

export type TaskEngineSuggestions = z.infer<typeof TaskSuggestionSchema>;

/**
 * Real Claude call grounded entirely in this org's actual open Task rows
 * (title/status/priority/dueDate/dependency graph/linked deal) — the model
 * is instructed never to invent a task that isn't in the list it's given.
 * Throws AINotConnectedError/propagates AIBillingError exactly like every
 * other AI entry point in this app (see src/lib/ai/agent-runtime.ts) —
 * never silently falls back to fabricated suggestions.
 */
export async function generateTaskSuggestions(organizationId: string): Promise<TaskEngineSuggestions> {
  if (!isAIConnected()) throw new AINotConnectedError();
  const client = getAnthropicClient();

  const tasks = await prisma.task.findMany({
    where: { organizationId, status: { notIn: ["COMPLETED", "CANCELLED"] } },
    orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
    take: 40,
    include: {
      dependsOn: { select: { title: true, status: true } },
      deal: { select: { name: true, value: true } },
    },
  });

  if (tasks.length === 0) {
    return { suggestions: [], nextBestAction: "No open tasks right now — the pipeline is clear." };
  }

  const taskSummaries = tasks
    .map((t) => {
      const deps = t.dependsOn.map((d) => `${d.title} (${d.status})`).join(", ") || "none";
      return `- [${t.id}] "${t.title}" — status=${t.status}, priority=${t.priority}, due=${t.dueDate ? t.dueDate.toISOString().slice(0, 10) : "none"}, deal=${t.deal?.name ?? "none"}, dependsOn=${deps}`;
    })
    .join("\n");

  const response = await client.messages.parse({
    model: AGENT_MODEL,
    max_tokens: 2048,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: zodOutputFormat(TaskSuggestionSchema) },
    system:
      "You are the AI Task Engine inside an enterprise CRM. You are given a real list of this organization's currently open tasks, each with its real status, priority, due date, and dependency list. Identify which tasks are genuinely blocked (a listed dependency isn't COMPLETED yet), suggest an honest priority for each based on due date and business context (a task linked to a real deal outranks one that isn't), and where a task looks like a repeatable/rote pattern, name one concrete automation opportunity. Reference tasks only by the [id] values given — never invent a task that isn't in the list.",
    messages: [{ role: "user", content: `Open tasks:\n${taskSummaries}` }],
  });

  if (!response.parsed_output) {
    throw new Error("Task suggestion response failed schema validation.");
  }
  return response.parsed_output;
}
