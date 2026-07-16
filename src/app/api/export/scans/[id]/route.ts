import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { scanReportToPdfBuffer, type ScanPdfReport } from "@/lib/export/scan-pdf";
import { scansToExcelBuffer, type ExportScanRow } from "@/lib/export/scan-export";

// Any unrecognized format falls back to PDF, mirroring the previous
// `?? "pdf"` + equality-check behavior exactly — never a 400 here.
const formatSchema = z.enum(["pdf", "excel"]).catch("pdf");

/** Auth-gated single website-scan export — full PDF report, or a summary Excel row. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const scan = await prisma.websiteScan.findUnique({
    where: { id },
    include: {
      technologies: true,
      seoAudit: true,
      performanceAudit: true,
      securityAudit: true,
      uxAudit: true,
      opportunity: true,
      executiveReport: true,
      recommendations: true,
    },
  });
  if (!scan) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId: scan.organizationId } },
  });
  if (!membership || membership.status !== "ACTIVE") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const format = formatSchema.parse(url.searchParams.get("format"));
  const fileBase = (scan.websiteName || scan.companyNameInput || scan.url).replace(/[^a-z0-9]+/gi, "-").slice(0, 60);

  if (format === "excel") {
    const row: ExportScanRow = {
      url: scan.finalUrl ?? scan.url,
      websiteName: scan.websiteName,
      companyNameInput: scan.companyNameInput,
      industryInput: scan.industryInput,
      status: scan.status,
      overallOpportunityScore: scan.opportunity?.overallOpportunityScore ?? null,
      band: scan.opportunity?.band ?? null,
      estimatedValueMin: scan.opportunity?.estimatedValueMin ?? null,
      estimatedValueMax: scan.opportunity?.estimatedValueMax ?? null,
      scannedAt: scan.scannedAt,
      createdAt: scan.createdAt,
    };
    const buffer = await scansToExcelBuffer([row]);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileBase}-scan.xlsx"`,
      },
    });
  }

  const report: ScanPdfReport = {
    url: scan.finalUrl ?? scan.url,
    websiteName: scan.websiteName,
    companyNameInput: scan.companyNameInput,
    scannedAt: scan.scannedAt,
    technologies: scan.technologies.map((t) => ({ name: t.name, category: t.category, evidence: t.evidence })),
    seoAudit: scan.seoAudit ? { seoScore: scan.seoAudit.seoScore, findings: scan.seoAudit.findings } : null,
    performanceAudit: scan.performanceAudit ? { performanceScore: scan.performanceAudit.performanceScore, findings: scan.performanceAudit.findings } : null,
    securityAudit: scan.securityAudit ? { securityScore: scan.securityAudit.securityScore, findings: scan.securityAudit.findings } : null,
    uxAudit: scan.uxAudit ? { uxScore: scan.uxAudit.uxScore, findings: scan.uxAudit.findings } : null,
    opportunity: scan.opportunity
      ? {
          overallOpportunityScore: scan.opportunity.overallOpportunityScore,
          band: scan.opportunity.band,
          estimatedValueMin: scan.opportunity.estimatedValueMin,
          estimatedValueMax: scan.opportunity.estimatedValueMax,
          estimatedTimeline: scan.opportunity.estimatedTimeline,
          confidenceLevel: scan.opportunity.confidenceLevel,
        }
      : null,
    executiveReport: scan.executiveReport
      ? {
          executiveSummary: scan.executiveReport.executiveSummary,
          strengths: scan.executiveReport.strengths,
          weaknesses: scan.executiveReport.weaknesses,
          businessOpportunities: scan.executiveReport.businessOpportunities,
          nextSteps: scan.executiveReport.nextSteps,
        }
      : null,
    recommendations: scan.recommendations.map((r) => ({ title: r.title, category: r.category, rationale: r.rationale, priority: r.priority })),
  };

  const buffer = await scanReportToPdfBuffer(report);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileBase}-executive-report.pdf"`,
    },
  });
}
