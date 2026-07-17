import { prisma } from "@/lib/prisma";
import type { SecurityRisk, SecurityRiskCategory, SecurityRiskStatus, RiskBand } from "@/generated/prisma/client";

/**
 * SOC2/ISO27001 security risk register — platform-wide (this is the
 * platform's own vendor security posture, distinct from the pre-existing
 * business-risk concepts like ChurnRiskAssessment/RiskLevel). riskScore and
 * band are always deterministic (likelihood * impact on a 1-5 scale),
 * never AI-guessed or independently settable.
 */

const BAND_THRESHOLDS: Array<{ max: number; band: RiskBand }> = [
  { max: 5, band: "LOW" },
  { max: 11, band: "MEDIUM" },
  { max: 19, band: "HIGH" },
  { max: 25, band: "CRITICAL" },
];

export function computeRiskBand(riskScore: number): RiskBand {
  for (const { max, band } of BAND_THRESHOLDS) {
    if (riskScore <= max) return band;
  }
  return "CRITICAL";
}

export interface CreateSecurityRiskInput {
  title: string;
  description: string;
  category: SecurityRiskCategory;
  likelihood: number;
  impact: number;
  mitigationPlan?: string;
  ownerUserId?: string;
  createdByUserId?: string;
}

function clampScale(value: number): number {
  return Math.max(1, Math.min(5, Math.round(value)));
}

export async function createSecurityRisk(input: CreateSecurityRiskInput): Promise<SecurityRisk> {
  const likelihood = clampScale(input.likelihood);
  const impact = clampScale(input.impact);
  const riskScore = likelihood * impact;

  return prisma.securityRisk.create({
    data: {
      title: input.title,
      description: input.description,
      category: input.category,
      likelihood,
      impact,
      riskScore,
      band: computeRiskBand(riskScore),
      mitigationPlan: input.mitigationPlan || null,
      ownerUserId: input.ownerUserId || null,
      createdByUserId: input.createdByUserId || null,
    },
  });
}

export interface UpdateSecurityRiskInput {
  title?: string;
  description?: string;
  category?: SecurityRiskCategory;
  likelihood?: number;
  impact?: number;
  status?: SecurityRiskStatus;
  mitigationPlan?: string | null;
  ownerUserId?: string | null;
  markReviewed?: boolean;
}

export async function updateSecurityRisk(id: string, input: UpdateSecurityRiskInput): Promise<SecurityRisk> {
  const existing = await prisma.securityRisk.findUniqueOrThrow({ where: { id } });
  const likelihood = input.likelihood !== undefined ? clampScale(input.likelihood) : existing.likelihood;
  const impact = input.impact !== undefined ? clampScale(input.impact) : existing.impact;
  const riskScore = likelihood * impact;

  return prisma.securityRisk.update({
    where: { id },
    data: {
      title: input.title,
      description: input.description,
      category: input.category,
      likelihood,
      impact,
      riskScore,
      band: computeRiskBand(riskScore),
      status: input.status,
      mitigationPlan: input.mitigationPlan,
      ownerUserId: input.ownerUserId,
      reviewedAt: input.markReviewed ? new Date() : undefined,
    },
  });
}

export async function listSecurityRisks(): Promise<SecurityRisk[]> {
  return prisma.securityRisk.findMany({ orderBy: [{ status: "asc" }, { riskScore: "desc" }] });
}

export interface RiskRegisterSummary {
  total: number;
  openCount: number;
  criticalOpenCount: number;
  byBand: Record<RiskBand, number>;
}

export async function getRiskRegisterSummary(): Promise<RiskRegisterSummary> {
  const risks = await prisma.securityRisk.findMany({ select: { status: true, band: true } });
  const byBand: Record<RiskBand, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  let openCount = 0;
  let criticalOpenCount = 0;
  for (const r of risks) {
    byBand[r.band]++;
    if (r.status === "OPEN" || r.status === "MITIGATING") {
      openCount++;
      if (r.band === "CRITICAL") criticalOpenCount++;
    }
  }
  return { total: risks.length, openCount, criticalOpenCount, byBand };
}
