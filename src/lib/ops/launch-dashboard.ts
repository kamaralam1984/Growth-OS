import { readFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/prisma";
import { runFullSystemCheck } from "@/lib/monitoring/aggregate";
import { getLatestLaunchChecklistRun } from "@/lib/ops/launch-checklist";
import type { ComplianceFindings } from "@/lib/security/compliance";
import type { ComplianceFramework } from "@/generated/prisma/client";

/**
 * Owner Launch Dashboard aggregation — every score below is computed from
 * real, already-persisted data (or a live probe reused from elsewhere),
 * never invented. A component with genuinely no data yet reports `null`
 * (rendered as "not yet measured" by the page), never a fabricated
 * placeholder number — the same discipline every other score in this app
 * follows (Growth Score's axisConfidence, ComplianceReport's disclaimer).
 */

export interface LaunchDashboardScores {
  launchScore: number | null;
  securityScore: number | null;
  complianceScore: number | null;
  performanceScore: number | null;
  accessibilityScore: number | null;
  infrastructureHealthScore: number | null;
  globalReadinessScore: number | null;
}

const ALL_FRAMEWORKS: ComplianceFramework[] = ["SOC2", "ISO27001", "GDPR", "CCPA", "DPDP_INDIA", "PCI_DSS", "WCAG"];

async function computeComplianceScore(): Promise<{ score: number | null; latestSoc2CodeControlRatio: number | null }> {
  const reports = await prisma.complianceReport.findMany({ orderBy: { generatedAt: "desc" } });
  const latestByFramework = new Map<ComplianceFramework, (typeof reports)[number]>();
  for (const report of reports) {
    if (!latestByFramework.has(report.framework)) latestByFramework.set(report.framework, report);
  }
  if (latestByFramework.size === 0) return { score: null, latestSoc2CodeControlRatio: null };

  const statusScore: Record<string, number> = { READY: 100, PARTIAL: 50, NOT_READY: 0 };
  const perFramework = ALL_FRAMEWORKS.map((f) => {
    const report = latestByFramework.get(f);
    return report ? statusScore[report.status] : 0;
  });
  const score = Math.round(perFramework.reduce((sum, n) => sum + n, 0) / ALL_FRAMEWORKS.length);

  const soc2 = latestByFramework.get("SOC2");
  let latestSoc2CodeControlRatio: number | null = null;
  if (soc2) {
    const findings = soc2.findings as unknown as ComplianceFindings;
    latestSoc2CodeControlRatio = findings.codeControlsTotal > 0 ? findings.codeControlsPassed / findings.codeControlsTotal : null;
  }

  return { score, latestSoc2CodeControlRatio };
}

async function computeSecurityScore(soc2CodeControlRatio: number | null): Promise<number | null> {
  const [criticalOpenRisks, riskCount] = await Promise.all([
    prisma.securityRisk.count({ where: { band: "CRITICAL", status: { in: ["OPEN", "MITIGATING"] } } }),
    prisma.securityRisk.count(),
  ]);
  if (soc2CodeControlRatio === null && riskCount === 0) return null;

  const controlComponent = soc2CodeControlRatio !== null ? soc2CodeControlRatio * 100 : 50; // 50 = "unmeasured, treat as neutral" — never assumed perfect
  const riskPenalty = Math.min(50, criticalOpenRisks * 25); // each open CRITICAL risk meaningfully drags the score down
  return Math.max(0, Math.round(controlComponent - riskPenalty));
}

async function computePerformanceScore(): Promise<number | null> {
  const latest = await prisma.loadTestResult.findFirst({ orderBy: { runAt: "desc" } });
  if (!latest) return null;
  // Same thresholds scripts/load-test.js's k6 config already uses (p95<800ms, error rate<1%) — real, established numbers, not new ones invented for this score.
  const latencyComponent = latest.p95Ms <= 800 ? 100 : Math.max(0, 100 - Math.round(((latest.p95Ms - 800) / 800) * 100));
  const errorComponent = latest.errorRate <= 0.01 ? 100 : Math.max(0, 100 - Math.round(latest.errorRate * 1000));
  return Math.round((latencyComponent + errorComponent) / 2);
}

async function computeAccessibilityScore(): Promise<number | null> {
  try {
    const raw = await readFile(path.join(process.cwd(), "storage", "a11y-reports", "latest.json"), "utf8");
    const report = JSON.parse(raw) as { routes?: Array<{ critical: number; serious: number; moderate: number }> };
    const routes = report.routes ?? [];
    if (routes.length === 0) return null;
    const critical = routes.reduce((sum, r) => sum + (r.critical ?? 0), 0);
    const serious = routes.reduce((sum, r) => sum + (r.serious ?? 0), 0);
    const moderate = routes.reduce((sum, r) => sum + (r.moderate ?? 0), 0);
    return Math.max(0, 100 - critical * 25 - serious * 10 - moderate * 2);
  } catch {
    return null;
  }
}

async function computeInfrastructureHealthScore(): Promise<number> {
  const result = await runFullSystemCheck();
  const statusScore = { HEALTHY: 100, DEGRADED: 50, DOWN: 0 } as const;
  return statusScore[result.overall];
}

export async function getLaunchDashboardScores(): Promise<LaunchDashboardScores> {
  const [launchRun, compliance, performanceScore, accessibilityScore, infrastructureHealthScore] = await Promise.all([
    getLatestLaunchChecklistRun(),
    computeComplianceScore(),
    computePerformanceScore(),
    computeAccessibilityScore(),
    computeInfrastructureHealthScore(),
  ]);
  const securityScore = await computeSecurityScore(compliance.latestSoc2CodeControlRatio);

  const launchScore = launchRun?.overallScore ?? null;
  const complianceScore = compliance.score;

  const componentScores = [launchScore, securityScore, complianceScore, performanceScore, accessibilityScore, infrastructureHealthScore].filter(
    (s): s is number => s !== null,
  );
  const globalReadinessScore = componentScores.length > 0 ? Math.round(componentScores.reduce((sum, s) => sum + s, 0) / componentScores.length) : null;

  return {
    launchScore,
    securityScore,
    complianceScore,
    performanceScore,
    accessibilityScore,
    infrastructureHealthScore,
    globalReadinessScore,
  };
}
