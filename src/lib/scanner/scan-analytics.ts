import { prisma } from "@/lib/prisma";

/** Real, deterministic Website Scanner stats — every number a direct count/avg over stored scans. */
export interface ScanStats {
  totalScans: number;
  avgOpportunityScore: number;
  highValueOpportunities: number;
  industriesScanned: number;
}

export async function getScanStats(organizationId: string): Promise<ScanStats> {
  const [totalScans, opportunities, industries] = await Promise.all([
    prisma.websiteScan.count({ where: { organizationId } }),
    prisma.opportunity.findMany({ where: { scan: { organizationId } }, select: { overallOpportunityScore: true, band: true } }),
    prisma.websiteScan.findMany({
      where: { organizationId, industryInput: { not: null } },
      select: { industryInput: true },
      distinct: ["industryInput"],
    }),
  ]);

  const avgOpportunityScore =
    opportunities.length > 0 ? Math.round(opportunities.reduce((sum, o) => sum + o.overallOpportunityScore, 0) / opportunities.length) : 0;
  const highValueOpportunities = opportunities.filter((o) => o.band === "HIGH").length;

  return {
    totalScans,
    avgOpportunityScore,
    highValueOpportunities,
    industriesScanned: industries.length,
  };
}

export interface CountPoint {
  label: string;
  count: number;
}

export interface ScanAnalytics {
  bandDistribution: CountPoint[];
  topRecommendedCategories: CountPoint[];
  avgDimensionScores: { label: string; score: number }[];
}

/** Powers the "Website Intelligence" section of /dashboard/analytics. */
export async function getScanAnalytics(organizationId: string): Promise<ScanAnalytics> {
  const [bandGroups, categoryGroups, opportunities] = await Promise.all([
    prisma.opportunity.groupBy({ by: ["band"], where: { scan: { organizationId } }, _count: { band: true } }),
    prisma.scanRecommendation.groupBy({
      by: ["category"],
      where: { scan: { organizationId } },
      _count: { category: true },
      orderBy: { _count: { category: "desc" } },
      take: 8,
    }),
    prisma.opportunity.findMany({
      where: { scan: { organizationId } },
      select: { seoScore: true, performanceScore: true, securityScore: true, uxScore: true, aiReadinessScore: true },
    }),
  ]);

  const avg = (values: number[]) => (values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0);

  return {
    bandDistribution: (["HIGH", "MEDIUM", "LOW"] as const).map((band) => ({
      label: band,
      count: bandGroups.find((g) => g.band === band)?._count.band ?? 0,
    })),
    topRecommendedCategories: categoryGroups.map((g) => ({ label: g.category.replace(/_/g, " "), count: g._count.category })),
    avgDimensionScores: [
      { label: "SEO", score: avg(opportunities.map((o) => o.seoScore)) },
      { label: "Performance", score: avg(opportunities.map((o) => o.performanceScore)) },
      { label: "Security", score: avg(opportunities.map((o) => o.securityScore)) },
      { label: "UX", score: avg(opportunities.map((o) => o.uxScore)) },
      { label: "AI Readiness", score: avg(opportunities.map((o) => o.aiReadinessScore)) },
    ],
  };
}
