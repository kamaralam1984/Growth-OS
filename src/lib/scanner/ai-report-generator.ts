import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { prisma } from "@/lib/prisma";
import { AGENT_MODEL, AINotConnectedError, getAnthropicClient, isAIConnected } from "@/lib/ai/client";
import { getPersona } from "@/lib/ai/personas";
import type { ExecutiveReport, ScanRecommendation } from "@/generated/prisma/client";

const RECOMMENDATION_CATEGORIES = [
  "ERP",
  "CRM",
  "HRMS",
  "HOSPITAL_MANAGEMENT",
  "SCHOOL_ERP",
  "INVENTORY",
  "POS",
  "BILLING",
  "ACCOUNTING",
  "WAREHOUSE",
  "AI_CHATBOT",
  "CUSTOMER_PORTAL",
  "VENDOR_PORTAL",
  "EMPLOYEE_PORTAL",
  "MOBILE_APP",
  "ADMIN_PANEL",
  "ANALYTICS_DASHBOARD",
  "WORKFLOW_AUTOMATION",
  "API_INTEGRATION",
  "CLOUD_MIGRATION",
] as const;

const ScanRecommendationItemSchema = z.object({
  category: z.enum(RECOMMENDATION_CATEGORIES),
  title: z.string().trim().min(1).max(120),
  rationale: z.string().trim().min(1),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]),
});

const ExecutiveReportResponseSchema = z.object({
  executiveSummary: z.string().trim().min(1),
  strengths: z.array(z.string().trim().min(1)).max(8),
  weaknesses: z.array(z.string().trim().min(1)).max(8),
  businessOpportunities: z.array(z.string().trim().min(1)).max(8),
  technologyOverview: z.string().trim().min(1),
  seoFindingsSummary: z.string().trim().min(1),
  performanceFindingsSummary: z.string().trim().min(1),
  securityObservations: z.string().trim().min(1),
  uxFindings: z.string().trim().min(1),
  businessImpact: z.string().trim().min(1),
  nextSteps: z.array(z.string().trim().min(1)).max(8),
  recommendations: z.array(ScanRecommendationItemSchema).min(3).max(6),
});

type FindingRow = { label: string; status: "pass" | "warn" | "fail"; detail: string };

function summarizeFindings(findings: unknown): string {
  const rows = (findings ?? []) as FindingRow[];
  return rows.map((f) => `  - [${f.status.toUpperCase()}] ${f.label}: ${f.detail}`).join("\n");
}

/**
 * Builds the plain-text summary of every REAL finding the model reasons
 * over — mirrors recommendations.ts's buildRecommendationDataSummary style.
 * No example/placeholder content is ever mixed in.
 */
async function buildScanSummary(scanId: string) {
  const scan = await prisma.websiteScan.findUniqueOrThrow({
    where: { id: scanId },
    include: {
      technologies: true,
      seoAudit: true,
      performanceAudit: true,
      securityAudit: true,
      uxAudit: true,
      opportunity: true,
    },
  });

  const sections = [
    `Website: ${scan.finalUrl ?? scan.url}`,
    [scan.websiteName, scan.companyNameInput, scan.industryInput, scan.websiteType].some(Boolean)
      ? `User-provided context: ${[scan.websiteName && `name "${scan.websiteName}"`, scan.companyNameInput && `company "${scan.companyNameInput}"`, scan.industryInput && `industry "${scan.industryInput}"`, scan.websiteType && `type "${scan.websiteType}"`].filter(Boolean).join(", ")}`
      : "No user-provided company context.",
    scan.technologies.length > 0
      ? `Detected technologies (real, evidence-based):\n${scan.technologies.map((t) => `  - ${t.name} (${t.category}) — evidence: ${t.evidence}`).join("\n")}`
      : "Detected technologies: none identified by the signature scan.",
    scan.seoAudit
      ? `SEO audit (score ${scan.seoAudit.seoScore}/100):\n${summarizeFindings(scan.seoAudit.findings)}`
      : "SEO audit: not available.",
    scan.performanceAudit
      ? `Performance audit (score ${scan.performanceAudit.performanceScore}/100, static-analysis estimate, not Lighthouse):\n${summarizeFindings(scan.performanceAudit.findings)}`
      : "Performance audit: not available.",
    scan.securityAudit
      ? `Security audit (score ${scan.securityAudit.securityScore}/100, high-level assessment, not a penetration test):\n${summarizeFindings(scan.securityAudit.findings)}`
      : "Security audit: not available.",
    scan.uxAudit
      ? `UX audit (score ${scan.uxAudit.uxScore}/100):\n${summarizeFindings(scan.uxAudit.findings)}`
      : "UX audit: not available.",
    scan.opportunity
      ? `Opportunity score: ${scan.opportunity.overallOpportunityScore}/100 (${scan.opportunity.band}). Digital maturity ${scan.opportunity.digitalScore}, automation opportunity ${scan.opportunity.automationScore}, growth signal ${scan.opportunity.growthScore}, AI readiness ${scan.opportunity.aiReadinessScore}.`
      : "Opportunity score: not available.",
  ];

  return { scan, summary: sections.join("\n\n") };
}

/**
 * Generates the AI-composed Executive Report + ScanRecommendations with ONE
 * real Claude call reasoning strictly over the real findings already
 * persisted for this scan (see seo/performance/security/ux-analyzer.ts +
 * opportunity-score.ts). Unlike Lead Finder's runWebSearchDiscovery, this
 * does NOT use the web_search tool — the real page has already been fetched,
 * so the model reasons over ground truth we already hold, exactly like
 * recommendations.ts's client.messages.parse + zodOutputFormat pattern.
 * Throws AINotConnectedError / a raw billing error on failure — callers
 * classify via the existing describeAIError convention.
 */
export async function generateExecutiveReport(scanId: string): Promise<ExecutiveReport & { recommendations: ScanRecommendation[] }> {
  if (!isAIConnected()) throw new AINotConnectedError();

  const { scan, summary } = await buildScanSummary(scanId);
  const persona = getPersona("SALES");
  const client = getAnthropicClient();
  const salesAgent = await prisma.aIAgentInstance.findFirst({ where: { organizationId: scan.organizationId, type: "SALES" } });

  if (salesAgent) {
    await prisma.aIAgentInstance.update({
      where: { id: salesAgent.id },
      data: { status: "ANALYZING", currentTask: `Generating website audit report for ${scan.finalUrl ?? scan.url}` },
    });
  }

  try {
    const response = await client.messages.parse({
      model: AGENT_MODEL,
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "medium",
        format: zodOutputFormat(ExecutiveReportResponseSchema),
      },
      system: `${persona.systemPrompt}\n\nYou are writing a premium Executive Opportunity Report for a website audit. Ground every sentence strictly in the real findings given to you below — never invent a fact, a technology, a score, or a business detail not present in that data. Where you infer something about the business (industry, business model, target customers) from the real signals, phrase it as an inference, not a certainty. Recommend 3 to 6 software solutions ONLY from the fixed category list you're given (never invent a new category), and only recommend something the real findings actually support — if the data doesn't support a strong recommendation, say so honestly rather than padding the list. All monetary figures elsewhere in this report are handled separately as indicative estimates, not quotations — do not state exact prices yourself.`,
      messages: [
        {
          role: "user",
          content: `Here is the real, verified scan data for this website:\n\n${summary}\n\nWrite the Executive Report now, plus 3-6 grounded software recommendations from this exact category list: ${RECOMMENDATION_CATEGORIES.join(", ")}.`,
        },
      ],
    });

    if (salesAgent) {
      await prisma.aIAgentInstance.update({ where: { id: salesAgent.id }, data: { status: "COMPLETED" } });
    }

    if (!response.parsed_output) {
      throw new Error("Executive report response failed schema validation.");
    }

    const parsed = response.parsed_output;

    const [report] = await prisma.$transaction([
      prisma.executiveReport.create({
        data: {
          scanId,
          executiveSummary: parsed.executiveSummary,
          strengths: parsed.strengths,
          weaknesses: parsed.weaknesses,
          businessOpportunities: parsed.businessOpportunities,
          technologyOverview: parsed.technologyOverview,
          seoFindingsSummary: parsed.seoFindingsSummary,
          performanceFindingsSummary: parsed.performanceFindingsSummary,
          securityObservations: parsed.securityObservations,
          uxFindings: parsed.uxFindings,
          businessImpact: parsed.businessImpact,
          nextSteps: parsed.nextSteps,
          generatedByAgentId: salesAgent?.id,
        },
      }),
      ...parsed.recommendations.map((rec) =>
        prisma.scanRecommendation.create({
          data: { scanId, category: rec.category, title: rec.title, rationale: rec.rationale, priority: rec.priority },
        }),
      ),
    ]);

    const recommendations = await prisma.scanRecommendation.findMany({ where: { scanId }, orderBy: { createdAt: "asc" } });

    return { ...report, recommendations };
  } catch (error) {
    if (salesAgent) {
      await prisma.aIAgentInstance.update({ where: { id: salesAgent.id }, data: { status: "IDLE" } }).catch(() => {});
    }
    throw error;
  }
}
