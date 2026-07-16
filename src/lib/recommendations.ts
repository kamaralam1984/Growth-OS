import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { prisma } from "@/lib/prisma";
import { AGENT_MODEL, AINotConnectedError, getAnthropicClient, isAIConnected } from "@/lib/ai/client";
import { getPersona } from "@/lib/ai/personas";
import type { Recommendation } from "@/generated/prisma/client";

const RECOMMENDATION_TYPES = [
  "BEST_OPPORTUNITY",
  "HIGHEST_VALUE_LEAD",
  "MOST_ACTIVE_COMPANY",
  "FASTEST_GROWING_COMPANY",
  "RECOMMENDED_INDUSTRY",
  "SUGGESTED_NEXT_STEP",
] as const;

const RecommendationItemSchema = z.object({
  type: z.enum(RECOMMENDATION_TYPES),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1),
  // Optional — must exactly match a name from the "Company reference" list given in the
  // prompt so it can be resolved to a real Company id after parsing. Never a fabricated id.
  relatedCompanyName: z.string().trim().optional(),
});

const RecommendationsResponseSchema = z.object({
  recommendations: z.array(RecommendationItemSchema).length(RECOMMENDATION_TYPES.length),
});

interface CompanyRef {
  id: string;
  name: string;
}

/**
 * Builds a real-data-only summary the model reasons over — top-scored
 * companies, highest-value open leads, most timeline activity in the last 30
 * days, and fastest growth rate. Mirrors insights-generator.ts's
 * buildDataSummary: every section is either real rows or an honest "none
 * yet". Also returns the deduplicated CompanyRef list used to resolve
 * relatedCompanyName back to a real id after generation.
 */
async function buildRecommendationDataSummary(organizationId: string): Promise<{ summary: string; companyRefs: CompanyRef[] }> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [topScored, topLeads, mostActive, fastestGrowing] = await Promise.all([
    prisma.leadScore.findMany({
      where: { company: { organizationId } },
      orderBy: { overallScore: "desc" },
      take: 5,
      include: { company: { select: { id: true, name: true, industry: true } } },
    }),
    prisma.lead.findMany({
      where: { companyRecord: { organizationId }, estimatedValue: { not: null } },
      orderBy: { estimatedValue: "desc" },
      take: 5,
      select: { name: true, estimatedValue: true, companyRecord: { select: { id: true, name: true } } },
    }),
    prisma.companyTimelineEvent.groupBy({
      by: ["companyId"],
      where: { company: { organizationId }, occurredAt: { gte: thirtyDaysAgo } },
      _count: { companyId: true },
      orderBy: { _count: { companyId: "desc" } },
      take: 5,
    }),
    prisma.company.findMany({
      where: { organizationId, growthRate: { not: null } },
      orderBy: { growthRate: "desc" },
      take: 5,
      select: { id: true, name: true, growthRate: true, industry: true },
    }),
  ]);

  const mostActiveCompanies = await prisma.company.findMany({
    where: { id: { in: mostActive.map((m) => m.companyId) } },
    select: { id: true, name: true },
  });
  const activeCountById = new Map(mostActive.map((m) => [m.companyId, m._count.companyId]));

  const industryBands = await prisma.leadScore.findMany({
    where: { company: { organizationId }, band: { in: ["HOT", "WARM"] } },
    select: { company: { select: { industry: true } } },
  });
  const industryCounts = new Map<string, number>();
  for (const row of industryBands) {
    const industry = row.company.industry;
    if (!industry) continue;
    industryCounts.set(industry, (industryCounts.get(industry) ?? 0) + 1);
  }
  const topIndustries = [...industryCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const companyRefs = new Map<string, CompanyRef>();
  for (const s of topScored) companyRefs.set(s.company.id, { id: s.company.id, name: s.company.name });
  for (const l of topLeads) if (l.companyRecord) companyRefs.set(l.companyRecord.id, { id: l.companyRecord.id, name: l.companyRecord.name });
  for (const c of mostActiveCompanies) companyRefs.set(c.id, { id: c.id, name: c.name });
  for (const c of fastestGrowing) companyRefs.set(c.id, { id: c.id, name: c.name });

  const sections = [
    topScored.length > 0
      ? `Top-scored companies (by deterministic lead score, highest first):\n${topScored
          .map((s) => `- ${s.company.name}: score ${s.overallScore} (${s.band})${s.company.industry ? `, industry ${s.company.industry}` : ""}`)
          .join("\n")}`
      : "Top-scored companies: none scored yet.",
    topLeads.length > 0
      ? `Highest-value open leads:\n${topLeads
          .map((l) => `- ${l.name}${l.companyRecord ? ` (${l.companyRecord.name})` : ""}: $${l.estimatedValue?.toFixed(2)}`)
          .join("\n")}`
      : "Highest-value open leads: none with an estimated value yet.",
    mostActiveCompanies.length > 0
      ? `Most active companies in the last 30 days (by timeline event count):\n${mostActiveCompanies
          .map((c) => `- ${c.name}: ${activeCountById.get(c.id) ?? 0} events`)
          .join("\n")}`
      : "Most active companies: no timeline activity in the last 30 days.",
    fastestGrowing.length > 0
      ? `Fastest-growing companies (by stored growth rate):\n${fastestGrowing
          .map((c) => `- ${c.name}: ${c.growthRate}% YoY${c.industry ? `, industry ${c.industry}` : ""}`)
          .join("\n")}`
      : "Fastest-growing companies: no growth rate data recorded yet.",
    topIndustries.length > 0
      ? `Industries with the most Hot/Warm-scored companies:\n${topIndustries.map(([industry, count]) => `- ${industry}: ${count}`).join("\n")}`
      : "Industry signal: not enough scored companies yet to identify a leading industry.",
    companyRefs.size > 0
      ? `Company reference (use these EXACT names for relatedCompanyName, never invent a new one):\n${[...companyRefs.values()].map((c) => `- ${c.name}`).join("\n")}`
      : "Company reference: no companies in the system yet.",
  ];

  return { summary: sections.join("\n\n"), companyRefs: [...companyRefs.values()] };
}

/**
 * Generates the Lead Finder / Companies "AI Recommendations" panel with ONE
 * real Claude call, grounded strictly in real stored Company/LeadScore/Lead/
 * CompanyTimelineEvent data — mirrors insights-generator.ts's
 * generateExecutiveInsights pattern exactly (client.messages.parse +
 * zodOutputFormat, no web_search tool, pure reasoning over provided data).
 * relatedCompanyId is never taken from the model directly (to avoid a
 * fabricated id) — it's resolved after parsing by matching the model's
 * relatedCompanyName against the real companyRefs list built above.
 */
export async function generateRecommendations(organizationId: string): Promise<Recommendation[]> {
  if (!isAIConnected()) throw new AINotConnectedError();

  const persona = getPersona("SALES");
  const client = getAnthropicClient();
  const salesAgent = await prisma.aIAgentInstance.findFirst({ where: { organizationId, type: "SALES" } });
  const { summary, companyRefs } = await buildRecommendationDataSummary(organizationId);
  const nameToId = new Map(companyRefs.map((c) => [c.name.toLowerCase(), c.id]));

  if (salesAgent) {
    await prisma.aIAgentInstance.update({
      where: { id: salesAgent.id },
      data: { status: "ANALYZING", currentTask: "Generating lead recommendations" },
    });
  }

  try {
    const response = await client.messages.parse({
      model: AGENT_MODEL,
      max_tokens: 2048,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "medium",
        format: zodOutputFormat(RecommendationsResponseSchema),
      },
      system: `${persona.systemPrompt}\n\nYou are generating the AI Recommendations panel for Lead Finder / Companies. You must produce exactly one recommendation for EACH of these categories: ${RECOMMENDATION_TYPES.join(", ")}. Ground every recommendation strictly in the real company/lead data given to you below — never invent a company, score, or number that isn't in that data. When a recommendation is about a specific company, set relatedCompanyName to its EXACT name from the Company reference list. If a category genuinely has no real signal yet (e.g. no companies are scored yet), say that honestly as the recommendation itself rather than fabricating one.`,
      messages: [
        {
          role: "user",
          content: `Here is the real, current state of the company's leads and companies:\n\n${summary}\n\nGenerate the ${RECOMMENDATION_TYPES.length} required recommendations now.`,
        },
      ],
    });

    if (salesAgent) {
      await prisma.aIAgentInstance.update({ where: { id: salesAgent.id }, data: { status: "COMPLETED" } });
    }

    if (!response.parsed_output) {
      throw new Error("Recommendation response failed schema validation.");
    }

    const created = await prisma.$transaction(
      response.parsed_output.recommendations.map((rec) =>
        prisma.recommendation.create({
          data: {
            organizationId,
            type: rec.type,
            title: rec.title,
            description: rec.description,
            relatedCompanyId: rec.relatedCompanyName ? (nameToId.get(rec.relatedCompanyName.toLowerCase()) ?? null) : null,
          },
        }),
      ),
    );

    return created;
  } catch (error) {
    if (salesAgent) {
      await prisma.aIAgentInstance.update({ where: { id: salesAgent.id }, data: { status: "IDLE" } }).catch(() => {});
    }
    throw error;
  }
}

/** Simple read: most recent recommendations first. No AI call, no side effects. */
export async function getRecentRecommendations(organizationId: string, limit = 6): Promise<
  Array<Recommendation & { relatedCompany: { id: string; name: string } | null }>
> {
  return prisma.recommendation.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { relatedCompany: { select: { id: true, name: true } } },
  });
}
