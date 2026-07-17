import { prisma } from "@/lib/prisma";

/**
 * Pipeline Intelligence — real aggregates over Lead/Deal/Proposal, filling
 * the gaps getSalesForecast (src/app/dashboard/crm/_lib/forecast.ts) and
 * getLeadIntelligenceAnalytics (src/lib/lead-analytics.ts) don't already
 * cover: lead velocity, proposal performance, sales-team performance, and a
 * deterministic pipeline health composite. No ML model anywhere in this
 * file — everything traces to a real Prisma aggregate. Lead/Deal have no
 * stage-history table, so time-in-stage/velocity use the same
 * updatedAt - createdAt proxy getSalesForecast already documents and uses
 * for sales-cycle length — a real but approximate signal, not a fabricated
 * precise one.
 */

const DAY_MS = 86_400_000;
const CLOSED_DEAL_STAGE_NAMES = ["Won", "Lost", "Archived"];
const DEAL_STALLED_DAYS = 14; // same threshold as evaluateDealStalled (src/lib/alerts/rules.ts)

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

export interface LeadVelocity {
  last30d: number;
  prior30d: number;
  changePercent: number | null;
  avgTimeToWonDays: number | null;
}

/**
 * Real Lead.createdAt counts, trailing 30 days vs the prior 30 days —
 * changePercent is null (never a fabricated 0%) when the prior window had
 * zero leads to compare against. avgTimeToWonDays uses the same
 * updatedAt - createdAt proxy as getSalesForecast's sales-cycle length,
 * applied to Leads whose pipeline stage is named "Won".
 */
export async function getLeadVelocity(organizationId: string): Promise<LeadVelocity> {
  const now = new Date();
  const last30Start = new Date(now.getTime() - 30 * DAY_MS);
  const prior30Start = new Date(now.getTime() - 60 * DAY_MS);

  const [last30d, prior30d, wonLeads] = await Promise.all([
    prisma.lead.count({ where: { pipelineStage: { workspace: { organizationId } }, createdAt: { gte: last30Start } } }),
    prisma.lead.count({ where: { pipelineStage: { workspace: { organizationId } }, createdAt: { gte: prior30Start, lt: last30Start } } }),
    prisma.lead.findMany({
      where: { pipelineStage: { workspace: { organizationId }, name: "Won" } },
      select: { createdAt: true, updatedAt: true },
    }),
  ]);

  const changePercent = prior30d > 0 ? ((last30d - prior30d) / prior30d) * 100 : null;

  const cycleDays = wonLeads
    .map((l) => (l.updatedAt.getTime() - l.createdAt.getTime()) / DAY_MS)
    .filter((days) => days >= 0);
  const avgTimeToWonDays = cycleDays.length > 0 ? cycleDays.reduce((sum, d) => sum + d, 0) / cycleDays.length : null;

  return { last30d, prior30d, changePercent, avgTimeToWonDays };
}

export interface ProposalPerformance {
  sentCount: number;
  openRate: number | null;
  acceptRate: number | null;
  avgTimeToAcceptDays: number | null;
}

/**
 * Pure aggregation over Proposal's already-existing tracking fields
 * (openCount, sentAt, acceptedAt, rejectedAt) — zero schema changes needed.
 * Rates are null (never a fabricated 0%) when nothing has been sent yet.
 */
export async function getProposalPerformance(organizationId: string): Promise<ProposalPerformance> {
  const sent = await prisma.proposal.findMany({
    where: { organizationId, sentAt: { not: null } },
    select: { openCount: true, sentAt: true, acceptedAt: true, rejectedAt: true },
  });

  const sentCount = sent.length;
  const openRate = sentCount > 0 ? (sent.filter((p) => p.openCount > 0).length / sentCount) * 100 : null;
  const decided = sent.filter((p) => p.acceptedAt || p.rejectedAt);
  const acceptRate = decided.length > 0 ? (decided.filter((p) => p.acceptedAt).length / decided.length) * 100 : null;

  const acceptDays = sent
    .filter((p) => p.acceptedAt && p.sentAt)
    .map((p) => (p.acceptedAt!.getTime() - p.sentAt!.getTime()) / DAY_MS)
    .filter((d) => d >= 0);
  const avgTimeToAcceptDays = acceptDays.length > 0 ? acceptDays.reduce((sum, d) => sum + d, 0) / acceptDays.length : null;

  return { sentCount, openRate, acceptRate, avgTimeToAcceptDays };
}

export interface SalesTeamMemberPerformance {
  ownerUserId: string;
  ownerName: string;
  dealsWon: number;
  dealsLost: number;
  winRate: number | null;
  avgDealSize: number | null;
}

/**
 * Same win-rate/avg-deal-size math as getSalesForecast, grouped by
 * Deal.ownerUserId instead of computed org-wide. Deals with no owner set
 * are excluded — there's no "team" to attribute them to.
 */
export async function getSalesTeamPerformance(organizationId: string): Promise<SalesTeamMemberPerformance[]> {
  const deals = await prisma.deal.findMany({
    where: { organizationId, ownerUserId: { not: null } },
    select: { value: true, ownerUserId: true, dealStage: { select: { name: true } }, owner: { select: { id: true, name: true, email: true } } },
  });

  const byOwner = new Map<string, { name: string; won: number; lost: number; wonValue: number[] }>();
  for (const deal of deals) {
    if (!deal.ownerUserId) continue;
    const entry = byOwner.get(deal.ownerUserId) ?? { name: deal.owner?.name ?? deal.owner?.email ?? "Unknown", won: 0, lost: 0, wonValue: [] };
    if (deal.dealStage.name === "Won") {
      entry.won += 1;
      if (deal.value != null) entry.wonValue.push(deal.value);
    } else if (deal.dealStage.name === "Lost") {
      entry.lost += 1;
    }
    byOwner.set(deal.ownerUserId, entry);
  }

  return Array.from(byOwner.entries()).map(([ownerUserId, entry]) => {
    const decided = entry.won + entry.lost;
    return {
      ownerUserId,
      ownerName: entry.name,
      dealsWon: entry.won,
      dealsLost: entry.lost,
      winRate: decided > 0 ? (entry.won / decided) * 100 : null,
      avgDealSize: entry.wonValue.length > 0 ? entry.wonValue.reduce((sum, v) => sum + v, 0) / entry.wonValue.length : null,
    };
  });
}

export interface PipelineHealthResult {
  score: number;
  stageBalance: number;
  stalledRatio: number;
  winRateTrend: "up" | "flat" | "down" | "unknown";
  formula: string;
}

/**
 * Deterministic composite — explicitly NOT machine-learned, NOT a
 * prediction. stageBalance rewards deals spread across open stages rather
 * than bottlenecked in one; stalledRatio penalizes real open deals past
 * expectedCloseDate (same 14-day threshold as evaluateDealStalled);
 * winRateTrend compares trailing-30d decided-deal win rate to the prior
 * 30 days.
 */
export async function getPipelineHealthScore(organizationId: string): Promise<PipelineHealthResult> {
  const now = new Date();
  const last30Start = new Date(now.getTime() - 30 * DAY_MS);
  const prior30Start = new Date(now.getTime() - 60 * DAY_MS);
  const stalledCutoff = new Date(now.getTime() - DEAL_STALLED_DAYS * DAY_MS);

  const [openDealsByStage, openDealsCount, stalledCount, last30Decided, prior30Decided] = await Promise.all([
    prisma.deal.groupBy({
      by: ["dealStageId"],
      where: { organizationId, dealStage: { name: { notIn: CLOSED_DEAL_STAGE_NAMES } } },
      _count: { _all: true },
    }),
    prisma.deal.count({ where: { organizationId, dealStage: { name: { notIn: CLOSED_DEAL_STAGE_NAMES } } } }),
    prisma.deal.count({
      where: { organizationId, expectedCloseDate: { lt: stalledCutoff }, dealStage: { name: { notIn: CLOSED_DEAL_STAGE_NAMES } } },
    }),
    prisma.deal.findMany({
      where: { organizationId, updatedAt: { gte: last30Start }, dealStage: { name: { in: ["Won", "Lost"] } } },
      select: { dealStage: { select: { name: true } } },
    }),
    prisma.deal.findMany({
      where: { organizationId, updatedAt: { gte: prior30Start, lt: last30Start }, dealStage: { name: { in: ["Won", "Lost"] } } },
      select: { dealStage: { select: { name: true } } },
    }),
  ]);

  // ---- Stage balance: how evenly open deals are spread across open stages ----
  let stageBalance = 50;
  if (openDealsByStage.length > 0 && openDealsCount > 0) {
    const idealShare = 1 / openDealsByStage.length;
    const maxShare = Math.max(...openDealsByStage.map((s) => s._count._all)) / openDealsCount;
    stageBalance = clamp(100 - (maxShare - idealShare) * 150);
  }

  // ---- Stalled ratio: real overdue open deals ÷ all open deals ----
  const stalledRatio = openDealsCount > 0 ? clamp((stalledCount / openDealsCount) * 100) : 0;

  // ---- Win-rate trend: last 30 real decided deals vs the prior 30 days ----
  const winRateOf = (decided: Array<{ dealStage: { name: string } }>): number | null => {
    if (decided.length === 0) return null;
    return (decided.filter((d) => d.dealStage.name === "Won").length / decided.length) * 100;
  };
  const last30WinRate = winRateOf(last30Decided);
  const prior30WinRate = winRateOf(prior30Decided);
  let winRateTrend: PipelineHealthResult["winRateTrend"] = "unknown";
  if (last30WinRate != null && prior30WinRate != null) {
    winRateTrend = last30WinRate > prior30WinRate + 3 ? "up" : last30WinRate < prior30WinRate - 3 ? "down" : "flat";
  }

  const trendComponent = winRateTrend === "up" ? 100 : winRateTrend === "down" ? 0 : 50;
  const score = clamp(stageBalance * 0.4 + (100 - stalledRatio) * 0.4 + trendComponent * 0.2);

  return {
    score,
    stageBalance,
    stalledRatio,
    winRateTrend,
    formula:
      "Deterministic composite (NOT machine-learned): 40% stage balance (how evenly open deals spread across stages) + " +
      "40% (100 − stalled-deal ratio, deals past expectedCloseDate by 14+ days) + 20% win-rate trend " +
      "(last 30 days' decided-deal win rate vs the prior 30 days).",
  };
}
