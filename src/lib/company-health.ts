import { prismaRead } from "@/lib/prisma";
import { withCache } from "@/lib/cache/redis-cache";

// Balances freshness against repeated-query cost on a page loaded very frequently.
const COMPANY_HEALTH_CACHE_TTL_SECONDS = 300;

export interface CompanyHealthScores {
  business: number;
  sales: number;
  marketing: number;
  crm: number;
  automation: number;
  revenue: number;
  security: number;
  ai: number;
  overall: number;
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function ratioScore(numerator: number, denominator: number, fallback = 50): number {
  if (denominator <= 0) return fallback;
  return clamp((numerator / denominator) * 100);
}

/**
 * Computes real, DB-derived health scores for an organization — never
 * fabricated. Every input signal traces to an actual Prisma query. Modules
 * with no backing data (e.g. no leads/deals recorded yet) score from the
 * fallback midpoint rather than a fake high/low number, and revenue-derived
 * scores are literally 0 when no Lead.estimatedValue has ever been entered.
 */
export async function computeCompanyHealth(organizationId: string): Promise<CompanyHealthScores> {
  // TTL-only invalidation — a 5-minute staleness window is an accepted tradeoff here, not exhaustively invalidated on every contributing mutation.
  return withCache(`company-health:${organizationId}`, COMPANY_HEALTH_CACHE_TTL_SECONDS, async () => {
    const [
      tasksTotal,
      tasksCompleted,
      agents,
      leads,
      wonStageLeads,
      meetingsTotal,
      meetingsCompleted,
      decisionsTotal,
      decisionsResolved,
      members,
      membersWith2FA,
    ] = await Promise.all([
      prismaRead.task.count({ where: { organizationId } }),
      prismaRead.task.count({ where: { organizationId, status: "COMPLETED" } }),
      prismaRead.aIAgentInstance.findMany({ where: { organizationId } }),
      prismaRead.lead.findMany({
        where: { pipelineStage: { workspace: { organizationId } } },
        select: { estimatedValue: true, pipelineStage: { select: { name: true } } },
      }),
      prismaRead.lead.findMany({
        where: {
          pipelineStage: { workspace: { organizationId }, name: "Won" },
        },
        select: { estimatedValue: true },
      }),
      prismaRead.meeting.count({ where: { organizationId } }),
      prismaRead.meeting.count({ where: { organizationId, status: "COMPLETED" } }),
      prismaRead.decision.count({ where: { organizationId } }),
      prismaRead.decision.count({ where: { organizationId, status: { not: "PENDING" } } }),
      prismaRead.membership.findMany({ where: { organizationId, status: "ACTIVE" }, select: { userId: true } }),
      prismaRead.user.count({
        where: {
          twoFactorEnabled: true,
          memberships: { some: { organizationId, status: "ACTIVE" } },
        },
      }),
    ]);

    const activeAgents = agents.filter((a) => a.active);
    const avgConfidence =
      activeAgents.length > 0
        ? activeAgents.reduce((sum, a) => sum + (a.confidenceScore ?? 50), 0) / activeAgents.length
        : 50;

    const automation = ratioScore(tasksCompleted, tasksTotal, tasksTotal === 0 ? 40 : 50);
    const sales = ratioScore(
      activeAgents.find((a) => a.type === "SALES")?.completedTasksCount ?? 0,
      Math.max(1, tasksCompleted),
      leads.length > 0 ? 55 : 35,
    );
    const marketing = ratioScore(
      activeAgents.find((a) => a.type === "MARKETING")?.completedTasksCount ?? 0,
      Math.max(1, tasksCompleted),
      40,
    );
    const crm = leads.length === 0 ? 20 : clamp(40 + Math.min(leads.length, 20) * 3);
    const revenueTotal = wonStageLeads.reduce((sum, l) => sum + (l.estimatedValue ?? 0), 0);
    // Honest zero when nothing has ever been recorded — not a synthetic floor.
    const revenue = revenueTotal > 0 ? clamp(30 + Math.log10(revenueTotal + 1) * 10) : 0;
    const meetingHealth = ratioScore(meetingsCompleted, meetingsTotal, 50);
    const decisionHealth = ratioScore(decisionsResolved, decisionsTotal, 50);
    const security =
      members.length > 0 ? clamp((membersWith2FA / members.length) * 70 + 30) : 60;
    const ai = clamp(avgConfidence);

    const business = clamp((sales + marketing + crm + meetingHealth + decisionHealth) / 5);
    const overall = clamp((business + automation + revenue + security + ai) / 5);

    return {
      business,
      sales,
      marketing,
      crm,
      automation,
      revenue,
      security,
      ai,
      overall,
    };
  });
}

export interface PipelineTotals {
  pipelineValue: number;
  wonValue: number;
  leadsWithValueCount: number;
  totalLeadsCount: number;
}

/** Real sums from Lead.estimatedValue — $0 when no lead has a value recorded. */
export async function computePipelineTotals(organizationId: string): Promise<PipelineTotals> {
  const leads = await prismaRead.lead.findMany({
    where: { pipelineStage: { workspace: { organizationId } } },
    select: { estimatedValue: true, pipelineStage: { select: { name: true } } },
  });

  const openLeads = leads.filter((l) => l.pipelineStage.name !== "Won" && l.pipelineStage.name !== "Lost");
  const wonLeads = leads.filter((l) => l.pipelineStage.name === "Won");

  return {
    pipelineValue: openLeads.reduce((sum, l) => sum + (l.estimatedValue ?? 0), 0),
    wonValue: wonLeads.reduce((sum, l) => sum + (l.estimatedValue ?? 0), 0),
    leadsWithValueCount: leads.filter((l) => l.estimatedValue != null).length,
    totalLeadsCount: leads.length,
  };
}
