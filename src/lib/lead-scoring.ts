import { prisma } from "@/lib/prisma";
import type { LeadScoreBand } from "@/generated/prisma/client";

/**
 * Deterministic, real-data lead scoring — documented judgment calls, exactly
 * like src/lib/company-health.ts. Every sub-score traces to an actual stored
 * field; nothing here is a per-company AI call (too slow/costly at list
 * scale) or a fabricated number. A signal that's simply unknown yet (no
 * research run, no revenue entered) scores a documented neutral midpoint —
 * never a fake high or low.
 */

const NEUTRAL = 50;

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function keywordOverlap(a: string[], b: string[]): boolean {
  const bLower = b.map((s) => s.toLowerCase());
  return a.some((word) => bLower.some((other) => other.includes(word.toLowerCase()) || word.toLowerCase().includes(other)));
}

export interface LeadScoreComputation {
  industryMatchScore: number;
  companySizeScore: number;
  growthScore: number;
  technologyFitScore: number;
  opportunitySizeScore: number;
  budgetPotentialScore: number;
  locationScore: number;
  digitalMaturityScore: number;
  automationNeedScore: number;
  overallScore: number;
  band: LeadScoreBand;
}

export async function computeLeadScore(companyId: string): Promise<LeadScoreComputation> {
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    include: {
      organization: { select: { services: true, clientTypes: true, industry: true, countriesServed: true } },
      leads: { select: { estimatedValue: true }, orderBy: { createdAt: "desc" }, take: 1 },
      intelligenceRuns: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  const org = company.organization;

  // 1. Industry match — real keyword overlap against the org's own
  // services/clientTypes/industry (Organization fields set during onboarding).
  const orgIndustryKeywords = [org.industry, ...org.services, ...org.clientTypes].filter((s): s is string => Boolean(s));
  const industryMatchScore = !company.industry || orgIndustryKeywords.length === 0
    ? NEUTRAL
    : keywordOverlap([company.industry], orgIndustryKeywords)
      ? 90
      : 30;

  // 2. Company size — mid-market band favored (documented general B2B heuristic).
  const companySizeScore =
    company.employeeCount == null
      ? NEUTRAL
      : company.employeeCount < 10
        ? 40
        : company.employeeCount < 50
          ? 70
          : company.employeeCount < 200
            ? 90
            : company.employeeCount < 1000
              ? 80
              : 60;

  // 3. Growth — from real Company.growthRate (%) when research has found one.
  const growthScore =
    company.growthRate == null
      ? NEUTRAL
      : company.growthRate >= 50
        ? 95
        : company.growthRate >= 20
          ? 80
          : company.growthRate >= 5
            ? 60
            : company.growthRate >= 0
              ? 45
              : 20;

  // 4. Technology fit — a documented proxy: a company with a known,
  // researched technology stack is one a tech/services vendor can credibly
  // engage with; an empty list just means "not yet researched," not "no fit."
  const technologyFitScore = company.technologies.length === 0 ? NEUTRAL : clamp(40 + company.technologies.length * 12);

  // 5. Opportunity size — from real estimatedRevenue, or the most recent
  // linked Lead's estimatedValue as a fallback.
  const opportunityBasis = company.estimatedRevenue ?? company.leads[0]?.estimatedValue ?? null;
  const opportunitySizeScore =
    opportunityBasis == null
      ? NEUTRAL
      : opportunityBasis < 100_000
        ? 35
        : opportunityBasis < 1_000_000
          ? 65
          : opportunityBasis < 10_000_000
            ? 85
            : 95;

  // 6. Budget potential — revenue-per-employee as a real proxy for budget health.
  const budgetPotentialScore =
    company.estimatedRevenue == null || !company.employeeCount
      ? NEUTRAL
      : clamp((company.estimatedRevenue / company.employeeCount / 2000) * 10 + 30);

  // 7. Location — real match against Organization.countriesServed.
  const locationScore = !company.headquartersCountry
    ? NEUTRAL
    : org.countriesServed.some((c) => c.toLowerCase() === company.headquartersCountry!.toLowerCase())
      ? 90
      : 40;

  // 8. Digital maturity — from the latest real CompanyIntelligence report's
  // own confidence score (a genuine research signal), else neutral until researched.
  const latestIntel = company.intelligenceRuns[0];
  const digitalMaturityScore = latestIntel ? clamp(latestIntel.confidenceScore) : NEUTRAL;

  // 9. Automation need — from the latest intelligence report's real pain
  // points + software needs count, else neutral until researched.
  const automationNeedScore = latestIntel
    ? clamp(30 + (latestIntel.potentialPainPoints.length + latestIntel.estimatedSoftwareNeeds.length) * 12)
    : NEUTRAL;

  const scores = [
    industryMatchScore,
    companySizeScore,
    growthScore,
    technologyFitScore,
    opportunitySizeScore,
    budgetPotentialScore,
    locationScore,
    digitalMaturityScore,
    automationNeedScore,
  ];
  const overallScore = clamp(scores.reduce((sum, s) => sum + s, 0) / scores.length);
  const band: LeadScoreBand = overallScore >= 70 ? "HOT" : overallScore >= 40 ? "WARM" : "COLD";

  return {
    industryMatchScore,
    companySizeScore,
    growthScore,
    technologyFitScore,
    opportunitySizeScore,
    budgetPotentialScore,
    locationScore,
    digitalMaturityScore,
    automationNeedScore,
    overallScore,
    band,
  };
}

/** Computes and upserts the LeadScore row. Never throws — scoring must never break the action that triggered it. */
export async function scoreCompany(companyId: string): Promise<void> {
  try {
    const score = await computeLeadScore(companyId);
    await prisma.leadScore.upsert({
      where: { companyId },
      create: { companyId, ...score, scoredAt: new Date() },
      update: { ...score, scoredAt: new Date() },
    });
  } catch (error) {
    console.error("[lead-scoring] scoreCompany failed:", error);
  }
}
