import { prisma } from "@/lib/prisma";

/**
 * Real, deterministic Lead Intelligence analytics — every number below is a
 * direct count/sum/groupBy over stored data, documented like
 * company-health.ts. Nothing here is estimated by AI or fabricated.
 */

export interface CompanyStats {
  companiesFound: number;
  qualifiedLeads: number;
  highPriorityLeads: number;
  industriesCount: number;
  countriesCount: number;
  pipelineValue: number;
  aiResearchCompleted: number;
}

/** Stats strip shown atop /dashboard/companies. */
export async function getCompanyStats(organizationId: string): Promise<CompanyStats> {
  const [companiesFound, qualifiedLeads, highPriorityLeads, industries, countries, openLeads, aiResearchCompleted] =
    await Promise.all([
      prisma.company.count({ where: { organizationId } }),
      prisma.leadScore.count({ where: { company: { organizationId }, band: { in: ["HOT", "WARM"] } } }),
      prisma.company.count({ where: { organizationId, priority: { in: ["HIGH", "URGENT"] } } }),
      prisma.company.findMany({ where: { organizationId, industry: { not: null } }, select: { industry: true }, distinct: ["industry"] }),
      prisma.company.findMany({
        where: { organizationId, headquartersCountry: { not: null } },
        select: { headquartersCountry: true },
        distinct: ["headquartersCountry"],
      }),
      prisma.lead.findMany({
        where: { pipelineStage: { workspace: { organizationId } } },
        select: { estimatedValue: true, pipelineStage: { select: { name: true } } },
      }),
      prisma.companyIntelligence.count({ where: { company: { organizationId } } }),
    ]);

  const pipelineValue = openLeads
    .filter((l) => l.pipelineStage.name !== "Won" && l.pipelineStage.name !== "Lost")
    .reduce((sum, l) => sum + (l.estimatedValue ?? 0), 0);

  return {
    companiesFound,
    qualifiedLeads,
    highPriorityLeads,
    industriesCount: industries.length,
    countriesCount: countries.length,
    pipelineValue,
    aiResearchCompleted,
  };
}

export interface CountPoint {
  label: string;
  count: number;
}

// Documented, transparent win-probability weights by lead score band — not a
// fake ML model. HOT-scored companies close far more often than COLD ones in
// typical B2B pipelines; these are conservative, clearly-labeled estimates,
// not a learned/fitted model.
const BAND_WIN_PROBABILITY: Record<"HOT" | "WARM" | "COLD" | "UNSCORED", number> = {
  HOT: 0.7,
  WARM: 0.4,
  COLD: 0.15,
  UNSCORED: 0.3,
};

export interface LeadIntelligenceAnalytics {
  topIndustries: CountPoint[];
  leadDistribution: CountPoint[];
  countryDistribution: CountPoint[];
  technologyTrends: CountPoint[];
  pipelineForecast: {
    weightedValue: number;
    openPipelineValue: number;
    formula: string;
  };
}

/** Powers the "Lead Intelligence" section of /dashboard/analytics. */
export async function getLeadIntelligenceAnalytics(organizationId: string): Promise<LeadIntelligenceAnalytics> {
  const [industryGroups, bandGroups, countryGroups, companies, openLeads] = await Promise.all([
    prisma.company.groupBy({
      by: ["industry"],
      where: { organizationId, industry: { not: null } },
      _count: { industry: true },
      orderBy: { _count: { industry: "desc" } },
      take: 8,
    }),
    prisma.leadScore.groupBy({
      by: ["band"],
      where: { company: { organizationId } },
      _count: { band: true },
    }),
    prisma.company.groupBy({
      by: ["headquartersCountry"],
      where: { organizationId, headquartersCountry: { not: null } },
      _count: { headquartersCountry: true },
      orderBy: { _count: { headquartersCountry: "desc" } },
      take: 8,
    }),
    prisma.company.findMany({ where: { organizationId }, select: { technologies: true } }),
    prisma.lead.findMany({
      where: { pipelineStage: { workspace: { organizationId } } },
      select: {
        estimatedValue: true,
        pipelineStage: { select: { name: true } },
        companyRecord: { select: { leadScore: { select: { band: true } } } },
      },
    }),
  ]);

  const techCounts = new Map<string, number>();
  for (const c of companies) {
    for (const tech of c.technologies) {
      techCounts.set(tech, (techCounts.get(tech) ?? 0) + 1);
    }
  }
  const technologyTrends = [...techCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, count]) => ({ label, count }));

  const openPipelineLeads = openLeads.filter((l) => l.pipelineStage.name !== "Won" && l.pipelineStage.name !== "Lost");
  const openPipelineValue = openPipelineLeads.reduce((sum, l) => sum + (l.estimatedValue ?? 0), 0);
  const weightedValue = openPipelineLeads.reduce((sum, l) => {
    const band = l.companyRecord?.leadScore?.band ?? "UNSCORED";
    return sum + (l.estimatedValue ?? 0) * BAND_WIN_PROBABILITY[band as keyof typeof BAND_WIN_PROBABILITY];
  }, 0);

  return {
    topIndustries: industryGroups.map((g) => ({ label: g.industry ?? "Unknown", count: g._count.industry })),
    leadDistribution: (["HOT", "WARM", "COLD"] as const).map((band) => ({
      label: band,
      count: bandGroups.find((g) => g.band === band)?._count.band ?? 0,
    })),
    countryDistribution: countryGroups.map((g) => ({ label: g.headquartersCountry ?? "Unknown", count: g._count.headquartersCountry })),
    technologyTrends,
    pipelineForecast: {
      weightedValue,
      openPipelineValue,
      formula: "Sum of each open lead's estimated value × its company's lead-score win probability (Hot 70% · Warm 40% · Cold 15% · Unscored 30%).",
    },
  };
}
