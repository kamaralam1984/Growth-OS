import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { prisma } from "@/lib/prisma";
import { computePipelineTotals } from "@/lib/company-health";
import { AGENT_MODEL, AINotConnectedError, getAnthropicClient, isAIConnected } from "@/lib/ai/client";
import { getPersona } from "@/lib/ai/personas";
import type { Insight } from "@/generated/prisma/client";

const INSIGHT_TYPES = [
  "TOP_OPPORTUNITY",
  "HIGHEST_PRIORITY",
  "RISK_ALERT",
  "GROWTH_SUGGESTION",
  "SALES_SUGGESTION",
  "MARKETING_SUGGESTION",
  "PRODUCTIVITY_SUGGESTION",
] as const;

const InsightItemSchema = z.object({
  type: z.enum(INSIGHT_TYPES),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1),
});

const InsightsResponseSchema = z.object({
  insights: z.array(InsightItemSchema).length(INSIGHT_TYPES.length),
});

/**
 * Builds a concise, real-data-only summary the model reasons over — recent
 * tasks/decisions/meetings, live agent statuses, and real pipeline totals
 * (via computePipelineTotals). No example/placeholder rows are ever mixed
 * in; an empty section is reported honestly as "none yet".
 */
async function buildDataSummary(organizationId: string): Promise<string> {
  const [tasks, decisions, meetings, agents, pipeline] = await Promise.all([
    prisma.task.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { title: true, status: true, dueDate: true },
    }),
    prisma.decision.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { topic: true, status: true },
    }),
    prisma.meeting.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { title: true, status: true, summary: true },
    }),
    prisma.aIAgentInstance.findMany({
      where: { organizationId },
      select: { name: true, type: true, status: true, currentTask: true, completedTasksCount: true },
    }),
    computePipelineTotals(organizationId),
  ]);

  const sections = [
    `Pipeline: ${pipeline.totalLeadsCount} total lead(s), ${pipeline.leadsWithValueCount} with an estimated value. Open pipeline value $${pipeline.pipelineValue.toFixed(2)}. Won value $${pipeline.wonValue.toFixed(2)}.`,
    agents.length > 0
      ? `AI agents:\n${agents
          .map((a) => `- ${a.name} (${a.type}): status=${a.status}, currentTask=${a.currentTask ?? "none"}, completedTasks=${a.completedTasksCount}`)
          .join("\n")}`
      : "AI agents: none configured yet.",
    tasks.length > 0
      ? `Recent tasks (most recent first):\n${tasks
          .map((t) => `- ${t.title} [${t.status}]${t.dueDate ? ` due ${t.dueDate.toISOString().slice(0, 10)}` : ""}`)
          .join("\n")}`
      : "Recent tasks: none yet.",
    decisions.length > 0
      ? `Recent decisions:\n${decisions.map((d) => `- ${d.topic} [${d.status}]`).join("\n")}`
      : "Recent decisions: none yet.",
    meetings.length > 0
      ? `Recent meetings:\n${meetings
          .map((m) => `- ${m.title} [${m.status}]${m.summary ? `: ${m.summary.slice(0, 200)}` : ""}`)
          .join("\n")}`
      : "Recent meetings: none yet.",
  ];

  return sections.join("\n\n");
}

/**
 * Generates the Command Center's "Executive Insights" panel with ONE real
 * Claude call and stores the result as Insight rows.
 *
 * Implementation choice (documented per the brief): this calls
 * `client.messages.parse` directly with the CEO persona's system prompt
 * (from personas.ts) rather than going through `runAgentTurn`, because
 * runAgentTurn only returns free-text `content` — it has no structured
 * multi-item output mode. A strict zod schema requesting exactly one insight
 * per InsightType is needed here, so this mirrors the same
 * `zodOutputFormat` + `client.messages.parse` pattern `runAgentVote` already
 * uses in agent-runtime.ts, just with a richer schema. If the organization
 * has a real CEO AIAgentInstance, its live status is set to
 * ANALYZING/COMPLETED/IDLE around the call (same as agent-runtime.ts does)
 * so the Executive Board UI reflects the work; if no CEO agent instance
 * exists yet, the call still proceeds using the CEO persona's system prompt
 * alone.
 *
 * Throws AINotConnectedError if no API key is configured. On a billing
 * failure, throws the raw Anthropic error un-wrapped — exactly like
 * runAgentTurn/runAgentVote do — so callers must check both
 * `error instanceof AINotConnectedError` and `isAIBillingError(error)`
 * themselves (see src/app/board/tasks/actions.ts's `describeAIError` for the
 * established pattern). Never falls back to fabricated insights on failure.
 */
export async function generateExecutiveInsights(organizationId: string): Promise<Insight[]> {
  if (!isAIConnected()) throw new AINotConnectedError();

  const persona = getPersona("CEO");
  const client = getAnthropicClient();
  const ceoAgent = await prisma.aIAgentInstance.findFirst({ where: { organizationId, type: "CEO" } });
  const dataSummary = await buildDataSummary(organizationId);

  if (ceoAgent) {
    await prisma.aIAgentInstance.update({
      where: { id: ceoAgent.id },
      data: { status: "ANALYZING", currentTask: "Generating executive insights" },
    });
  }

  try {
    const response = await client.messages.parse({
      model: AGENT_MODEL,
      max_tokens: 2048,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "medium",
        format: zodOutputFormat(InsightsResponseSchema),
      },
      system: `${persona.systemPrompt}\n\nYou are generating the Executive Insights panel on the Command Center dashboard. You must produce exactly one insight for EACH of these categories: ${INSIGHT_TYPES.join(", ")}. Ground every single insight strictly in the real company data given to you below — never invent a lead, a number, a deal, or an event that isn't in that data. If a category genuinely has no real signal to point to yet (for example: there is no top opportunity because there are no leads with value recorded yet), say that honestly as the insight itself rather than fabricating one.`,
      messages: [
        {
          role: "user",
          content: `Here is the real, current state of the company:\n\n${dataSummary}\n\nGenerate the 7 required insights now.`,
        },
      ],
    });

    if (ceoAgent) {
      await prisma.aIAgentInstance.update({ where: { id: ceoAgent.id }, data: { status: "COMPLETED" } });
    }

    if (!response.parsed_output) {
      throw new Error("Insight response failed schema validation.");
    }

    const created = await prisma.$transaction(
      response.parsed_output.insights.map((insight) =>
        prisma.insight.create({
          data: {
            organizationId,
            type: insight.type,
            title: insight.title,
            description: insight.description,
          },
        }),
      ),
    );

    return created;
  } catch (error) {
    if (ceoAgent) {
      await prisma.aIAgentInstance.update({ where: { id: ceoAgent.id }, data: { status: "IDLE" } }).catch(() => {});
    }
    throw error;
  }
}

/** Simple read: most recent insights first. No AI call, no side effects. */
export async function getRecentInsights(organizationId: string, limit = 7): Promise<Insight[]> {
  return prisma.insight.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
