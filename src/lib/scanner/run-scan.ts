import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { safeFetchWebsite } from "./safe-fetch";
import { parseHtml } from "./html-parser";
import { detectTechnologies } from "./technology-detector";
import { analyzeSEO } from "./seo-analyzer";
import { analyzePerformance } from "./performance-analyzer";
import { analyzeSecurity } from "./security-analyzer";
import { analyzeUX } from "./ux-analyzer";
import { computeOpportunity } from "./opportunity-score";
import { generateExecutiveReport } from "./ai-report-generator";
import { AINotConnectedError, AIBillingError, isAIBillingError } from "@/lib/ai/client";

export interface RunScanResult {
  ok: boolean;
  scanId: string;
  aiReportError?: { kind: "not_connected" | "billing" | "generic"; message: string };
}

function describeAiReportError(error: unknown): { kind: "not_connected" | "billing" | "generic"; message: string } {
  if (error instanceof AINotConnectedError) {
    return { kind: "not_connected", message: "AI is not connected — no ANTHROPIC_API_KEY is configured for this environment." };
  }
  if (error instanceof AIBillingError || isAIBillingError(error)) {
    return { kind: "billing", message: "AI is connected but the account has no API credits — add credits at console.anthropic.com/settings/billing." };
  }
  console.error("[scanner] AI report generation failed:", error);
  return { kind: "generic", message: "Something went wrong generating the AI report. The verified findings below are still real and complete." };
}

/**
 * Orchestrates one full website scan: real fetch → real parse → real
 * detector/analyzers → deterministic Opportunity score → one real AI
 * reasoning pass. Every verified section (Technology/SEO/Performance/
 * Security/UX/Opportunity) persists regardless of AI availability — the
 * Executive Report is the only part gated on a working Claude connection,
 * and its failure is surfaced honestly rather than blocking the whole scan.
 * Synchronous, awaited end-to-end — same "no background jobs" convention as
 * every other AI action in this app.
 */
export async function runWebsiteScan(scanId: string): Promise<RunScanResult> {
  await prisma.websiteScan.update({ where: { id: scanId }, data: { status: "SCANNING" } });
  const scan = await prisma.websiteScan.findUniqueOrThrow({ where: { id: scanId } });

  const fetchResult = await safeFetchWebsite(scan.url);
  if (!fetchResult.ok) {
    await prisma.websiteScan.update({ where: { id: scanId }, data: { status: "FAILED", errorMessage: fetchResult.error } });
    return { ok: false, scanId };
  }

  await prisma.websiteScan.update({
    where: { id: scanId },
    data: { finalUrl: fetchResult.finalUrl, httpStatus: fetchResult.status, scannedAt: new Date() },
  });

  const parsed = parseHtml(fetchResult.html, fetchResult.finalUrl);
  const technologies = detectTechnologies(fetchResult.headers, parsed);

  const [seo, performance, security, ux] = await Promise.all([
    analyzeSEO(parsed, fetchResult.finalUrl),
    Promise.resolve(analyzePerformance({ responseTimeMs: fetchResult.responseTimeMs, html: fetchResult.html, headers: fetchResult.headers, parsed })),
    Promise.resolve(analyzeSecurity({ finalUrl: fetchResult.finalUrl, headers: fetchResult.headers, parsed })),
    Promise.resolve(analyzeUX(parsed)),
  ]);

  if (technologies.length > 0) {
    await prisma.technology.createMany({ data: technologies.map((t) => ({ scanId, name: t.name, category: t.category, evidence: t.evidence })) });
  }
  await prisma.sEOAudit.create({ data: { scanId, ...seo, findings: seo.findings as unknown as Prisma.InputJsonValue } });
  await prisma.performanceAudit.create({ data: { scanId, ...performance, findings: performance.findings as unknown as Prisma.InputJsonValue } });
  await prisma.securityAudit.create({ data: { scanId, ...security, findings: security.findings as unknown as Prisma.InputJsonValue } });
  await prisma.uXAudit.create({ data: { scanId, ...ux, findings: ux.findings as unknown as Prisma.InputJsonValue } });

  const opportunity = computeOpportunity({
    seoScore: seo.seoScore,
    performanceScore: performance.performanceScore,
    securityScore: security.securityScore,
    uxScore: ux.uxScore,
    technologiesCount: technologies.length,
  });
  await prisma.opportunity.create({
    data: {
      scanId,
      digitalScore: opportunity.digitalScore,
      automationScore: opportunity.automationScore,
      growthScore: opportunity.growthScore,
      aiReadinessScore: opportunity.aiReadinessScore,
      seoScore: seo.seoScore,
      performanceScore: performance.performanceScore,
      securityScore: security.securityScore,
      uxScore: ux.uxScore,
      overallOpportunityScore: opportunity.overallOpportunityScore,
      band: opportunity.band,
      estimatedValueMin: opportunity.estimatedValueMin,
      estimatedValueMax: opportunity.estimatedValueMax,
      estimatedTimeline: opportunity.estimatedTimeline,
      confidenceLevel: opportunity.confidenceLevel,
    },
  });

  let aiReportError: RunScanResult["aiReportError"];
  try {
    await generateExecutiveReport(scanId);
  } catch (error) {
    aiReportError = describeAiReportError(error);
  }

  await prisma.websiteScan.update({ where: { id: scanId }, data: { status: "COMPLETED" } });

  return { ok: true, scanId, aiReportError };
}
