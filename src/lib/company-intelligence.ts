import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { runCompanyIntelligenceTurn, runResearchNoteTurn } from "@/lib/ai/agent-runtime";
import type { ResearchTopic } from "@/generated/prisma/client";

/**
 * Records a real, timestamped company event — the honest verified/inferred/
 * manual distinction the brief requires lives in `source`. Never throws,
 * matching logActivity's fire-and-forget convention.
 */
export async function addCompanyTimelineEvent(input: {
  companyId: string;
  type:
    | "CREATED"
    | "FUNDING"
    | "WEBSITE_UPDATE"
    | "ANNOUNCEMENT"
    | "HIRING"
    | "EXPANSION"
    | "RESEARCH_NOTE"
    | "INTERNAL_ACTIVITY";
  title: string;
  description?: string | null;
  source: "SYSTEM" | "AI_RESEARCH" | "MANUAL";
  occurredAt?: Date;
}): Promise<void> {
  try {
    await prisma.companyTimelineEvent.create({
      data: {
        companyId: input.companyId,
        type: input.type,
        title: input.title,
        description: input.description ?? null,
        source: input.source,
        occurredAt: input.occurredAt ?? new Date(),
      },
    });
  } catch (error) {
    console.error("[company-intelligence] addCompanyTimelineEvent failed:", error);
  }
}

async function resolveSalesAgent(organizationId: string) {
  return prisma.aIAgentInstance.findUnique({
    where: { organizationId_type: { organizationId, type: "SALES" } },
  });
}

/**
 * Generates a real AI Company Intelligence report (two real Claude calls —
 * live web research, then structured extraction — see runCompanyIntelligenceTurn)
 * and logs a timeline event. Kept as an append-only log (CompanyIntelligence
 * has no unique constraint on companyId) so re-running never destroys the
 * previous report's history.
 */
export async function generateCompanyIntelligence(companyId: string): Promise<{ id: string }> {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  const agent = await resolveSalesAgent(company.organizationId);
  if (!agent) throw new Error("Your Sales agent isn't set up yet.");

  const contextParts = [
    company.industry ? `Industry: ${company.industry}` : null,
    company.employeeCount ? `Approx. ${company.employeeCount} employees` : null,
    company.headquartersCity || company.headquartersCountry
      ? `Headquartered in ${[company.headquartersCity, company.headquartersCountry].filter(Boolean).join(", ")}`
      : null,
    company.notes ? `Internal notes: ${company.notes}` : null,
  ].filter(Boolean);

  const result = await runCompanyIntelligenceTurn({
    agentId: agent.id,
    agentType: "SALES",
    agentName: agent.name,
    companyName: company.name,
    companyWebsite: company.website ?? undefined,
    companyContext: contextParts.length > 0 ? contextParts.join(". ") : undefined,
  });

  const report = await prisma.companyIntelligence.create({
    data: {
      companyId,
      businessSummary: result.businessSummary,
      productsSummary: result.productsSummary || null,
      servicesSummary: result.servicesSummary || null,
      techStackSummary: result.techStackSummary || null,
      digitalPresenceSummary: result.digitalPresenceSummary || null,
      seoOverview: result.seoOverview || null,
      performanceOverview: result.performanceOverview || null,
      growthSignals: result.growthSignals,
      hiringSignals: result.hiringSignals,
      expansionIndicators: result.expansionIndicators,
      businessOpportunities: result.businessOpportunities,
      estimatedSoftwareNeeds: result.estimatedSoftwareNeeds,
      potentialPainPoints: result.potentialPainPoints,
      recommendedSolution: result.recommendedSolution || null,
      estimatedProjectValue: result.estimatedProjectValue ?? null,
      confidenceScore: result.confidenceScore,
      generatedByAgentId: agent.id,
    },
  });

  await addCompanyTimelineEvent({
    companyId,
    type: "RESEARCH_NOTE",
    title: "AI Company Intelligence report generated",
    description: result.businessSummary.slice(0, 200),
    source: "AI_RESEARCH",
  });

  // Real, sourced signals the report found — each becomes its own honestly-
  // labeled timeline event rather than being buried only inside the report.
  for (const signal of result.hiringSignals.slice(0, 3)) {
    await addCompanyTimelineEvent({ companyId, type: "HIRING", title: signal, source: "AI_RESEARCH" });
  }
  for (const signal of result.expansionIndicators.slice(0, 3)) {
    await addCompanyTimelineEvent({ companyId, type: "EXPANSION", title: signal, source: "AI_RESEARCH" });
  }

  await logActivity({
    organizationId: company.organizationId,
    type: "COMPLETED_WORK",
    description: `${agent.name} generated an AI Intelligence report for ${company.name}.`,
    actorAgentId: agent.id,
    metadata: { companyId, reportId: report.id },
  });

  return { id: report.id };
}

export async function generateResearchNote(companyId: string, topic: ResearchTopic): Promise<{ id: string }> {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  const agent = await resolveSalesAgent(company.organizationId);
  if (!agent) throw new Error("Your Sales agent isn't set up yet.");

  const result = await runResearchNoteTurn({
    agentId: agent.id,
    agentType: "SALES",
    agentName: agent.name,
    companyName: company.name,
    companyWebsite: company.website ?? undefined,
    topic,
  });

  const note = await prisma.researchNote.create({
    data: { companyId, topic, content: result.content, generatedByAgentId: agent.id },
  });

  await addCompanyTimelineEvent({
    companyId,
    type: "RESEARCH_NOTE",
    title: `Research note: ${topic.replace(/_/g, " ").toLowerCase()}`,
    description: result.content.slice(0, 200),
    source: "AI_RESEARCH",
  });

  await logActivity({
    organizationId: company.organizationId,
    type: "COMPLETED_WORK",
    description: `${agent.name} wrote a ${topic.replace(/_/g, " ").toLowerCase()} research note for ${company.name}.`,
    actorAgentId: agent.id,
    metadata: { companyId, noteId: note.id },
  });

  return { id: note.id };
}
