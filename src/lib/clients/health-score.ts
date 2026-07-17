import { prisma } from "@/lib/prisma";
import { computeProjectHealthScore } from "@/lib/projects/health-score";
import type { ClientHealthClassification, Prisma } from "@/generated/prisma/client";

const DAY_MS = 86_400_000;
// Matches the ENGAGEMENT_DECAY_HORIZON judgment call in
// evaluateClientChurnRisk (src/lib/alerts/rules.ts) — 180 days of silence
// decays engagement to zero, same horizon the churn alert already treats as
// "long enough to be a real problem."
const ENGAGEMENT_DECAY_HORIZON_DAYS = 180;

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

export interface ClientHealthFactor {
  factor: "payment" | "engagement" | "delivery" | "contract";
  score: number;
  isNeutralFallback: boolean;
  dataSource: string;
}

export interface ClientHealthResult {
  overallScore: number;
  classification: ClientHealthClassification;
  paymentScore: number;
  engagementScore: number;
  deliveryScore: number;
  contractScore: number;
  /** 0-100: % of the 4 factors backed by real (non-fallback) data. */
  dataConfidence: number;
  factors: ClientHealthFactor[];
}

function classify(score: number): ClientHealthClassification {
  if (score >= 70) return "HEALTHY";
  if (score >= 40) return "NEEDS_ATTENTION";
  return "HIGH_RISK";
}

interface InvoiceRow {
  status: string;
  grandTotal: number;
  amountPaid: number;
  dueDate: Date | null;
  paidAt: Date | null;
  updatedAt: Date;
}

/**
 * Real on-time-payment ratio from Invoice rows, penalized for currently
 * OVERDUE invoices. Fallback 50 (neutral, never a fabricated "good" number)
 * when the client has zero invoices to measure.
 */
function computePaymentFactor(invoices: InvoiceRow[]): { score: number; isNeutralFallback: boolean } {
  if (invoices.length === 0) return { score: 50, isNeutralFallback: true };

  const fullyPaid = invoices.filter((inv) => inv.grandTotal > 0 && inv.amountPaid >= inv.grandTotal);
  const onTime = fullyPaid.filter((inv) => !inv.dueDate || !inv.paidAt || inv.paidAt.getTime() <= inv.dueDate.getTime());
  const overdue = invoices.filter((inv) => inv.status === "OVERDUE");

  const paidRatio = fullyPaid.length / invoices.length;
  const onTimeRatio = fullyPaid.length > 0 ? onTime.length / fullyPaid.length : 0.5;
  const overduePenalty = (overdue.length / invoices.length) * 40;

  return { score: clamp(paidRatio * 60 + onTimeRatio * 40 - overduePenalty), isNeutralFallback: false };
}

/**
 * Recency decay over the most recent Invoice/Project/Contract updatedAt —
 * the same real activity signal evaluateClientChurnRisk already reads, just
 * expressed as a continuous decay curve instead of a single 90-day
 * threshold. Fallback 50 when the client has no linked activity at all.
 */
function computeEngagementFactor(activityTimestamps: number[]): { score: number; isNeutralFallback: boolean } {
  if (activityTimestamps.length === 0) return { score: 50, isNeutralFallback: true };
  const daysSince = (Date.now() - Math.max(...activityTimestamps)) / DAY_MS;
  return { score: clamp(100 - (daysSince / ENGAGEMENT_DECAY_HORIZON_DAYS) * 100), isNeutralFallback: false };
}

/**
 * Average of computeProjectHealthScore (src/lib/projects/health-score.ts)
 * across the client's own projects — reused, not re-derived. Fallback 50
 * when the client has no projects.
 */
async function computeDeliveryFactor(projectIds: string[]): Promise<{ score: number; isNeutralFallback: boolean }> {
  if (projectIds.length === 0) return { score: 50, isNeutralFallback: true };
  const scores = await Promise.all(projectIds.map((id) => computeProjectHealthScore(id)));
  const avg = scores.reduce((sum, s) => sum + s.overallScore, 0) / scores.length;
  return { score: clamp(avg), isNeutralFallback: false };
}

interface ContractRow {
  status: string;
  endDate: Date | null;
}

interface SubscriptionRow {
  status: string;
  renewalDate: Date | null;
}

/**
 * Real signed-and-unexpired Contract presence + non-overdue ACTIVE
 * Subscription presence. Fallback 50 when the client has neither on record.
 */
function computeContractFactor(contracts: ContractRow[], subscriptions: SubscriptionRow[]): { score: number; isNeutralFallback: boolean } {
  if (contracts.length === 0 && subscriptions.length === 0) return { score: 50, isNeutralFallback: true };

  const now = Date.now();
  const activeContract = contracts.some((c) => c.status === "SIGNED" && (!c.endDate || c.endDate.getTime() > now));
  const expiredContract = contracts.some((c) => c.status === "EXPIRED" || (c.status === "SIGNED" && c.endDate && c.endDate.getTime() <= now));
  const activeSubscription = subscriptions.some((s) => s.status === "ACTIVE" && (!s.renewalDate || s.renewalDate.getTime() > now));
  const overdueSubscription = subscriptions.some((s) => s.status === "ACTIVE" && s.renewalDate && s.renewalDate.getTime() <= now);

  let score = 50;
  if (activeContract || activeSubscription) score = 85;
  if (expiredContract || overdueSubscription) score = activeContract || activeSubscription ? 55 : 20;

  return { score: clamp(score), isNeutralFallback: false };
}

/**
 * Deterministic composite of 4 real signals — no LLM call, ever. Any factor
 * with no backing data uses the documented neutral fallback (50) and is
 * flagged isNeutralFallback: true in the returned factors[], the same
 * "never present a fallback as a real measurement" discipline as
 * company-health.ts.
 */
export async function computeClientHealthScore(clientId: string): Promise<ClientHealthResult> {
  const client = await prisma.client.findUniqueOrThrow({
    where: { id: clientId },
    select: {
      invoices: { select: { status: true, grandTotal: true, amountPaid: true, dueDate: true, paidAt: true, updatedAt: true } },
      projects: { select: { id: true, updatedAt: true } },
      contracts: { select: { status: true, endDate: true, updatedAt: true } },
      subscriptions: { select: { status: true, renewalDate: true, updatedAt: true } },
    },
  });

  const activityTimestamps = [
    ...client.invoices.map((r) => r.updatedAt.getTime()),
    ...client.projects.map((r) => r.updatedAt.getTime()),
    ...client.contracts.map((r) => r.updatedAt.getTime()),
    ...client.subscriptions.map((r) => r.updatedAt.getTime()),
  ];

  const payment = computePaymentFactor(client.invoices);
  const engagement = computeEngagementFactor(activityTimestamps);
  const delivery = await computeDeliveryFactor(client.projects.map((p) => p.id));
  const contract = computeContractFactor(client.contracts, client.subscriptions);

  const factors: ClientHealthFactor[] = [
    { factor: "payment", score: payment.score, isNeutralFallback: payment.isNeutralFallback, dataSource: "Invoice.amountPaid/grandTotal/dueDate/paidAt/status" },
    { factor: "engagement", score: engagement.score, isNeutralFallback: engagement.isNeutralFallback, dataSource: "Most recent Invoice/Project/Contract/Subscription updatedAt" },
    { factor: "delivery", score: delivery.score, isNeutralFallback: delivery.isNeutralFallback, dataSource: "computeProjectHealthScore across linked Project rows" },
    { factor: "contract", score: contract.score, isNeutralFallback: contract.isNeutralFallback, dataSource: "Contract.status/endDate + Subscription.status/renewalDate" },
  ];

  const overallScore = clamp((payment.score + engagement.score + delivery.score + contract.score) / 4);
  const dataConfidence = clamp((factors.filter((f) => !f.isNeutralFallback).length / factors.length) * 100);

  return {
    overallScore,
    classification: classify(overallScore),
    paymentScore: payment.score,
    engagementScore: engagement.score,
    deliveryScore: delivery.score,
    contractScore: contract.score,
    dataConfidence,
    factors,
  };
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Idempotent daily upsert — exact precedent of ensureTodaySnapshot
 * (src/lib/analytics.ts) / ensureTodayProjectHealthSnapshot
 * (src/lib/projects/health-score.ts). No backfilling of fake past history —
 * trend data only accumulates from the day this first ran onward.
 */
export async function ensureTodayClientHealthSnapshot(clientId: string, organizationId: string, now: Date = new Date()): Promise<void> {
  const date = startOfDay(now);

  const existing = await prisma.clientHealthSnapshot.findUnique({ where: { clientId_date: { clientId, date } } });
  if (existing) return;

  const result = await computeClientHealthScore(clientId);

  await prisma.clientHealthSnapshot.upsert({
    where: { clientId_date: { clientId, date } },
    create: {
      clientId,
      organizationId,
      date,
      overallScore: result.overallScore,
      classification: result.classification,
      paymentScore: result.paymentScore,
      engagementScore: result.engagementScore,
      deliveryScore: result.deliveryScore,
      contractScore: result.contractScore,
      dataConfidence: result.dataConfidence,
      factorsJson: result.factors as unknown as Prisma.InputJsonValue,
    },
    update: {
      overallScore: result.overallScore,
      classification: result.classification,
      paymentScore: result.paymentScore,
      engagementScore: result.engagementScore,
      deliveryScore: result.deliveryScore,
      contractScore: result.contractScore,
      dataConfidence: result.dataConfidence,
      factorsJson: result.factors as unknown as Prisma.InputJsonValue,
    },
  });
}
