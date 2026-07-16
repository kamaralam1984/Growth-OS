import PDFDocument from "pdfkit";

function collectPdfBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

type FindingRow = { label: string; status: "pass" | "warn" | "fail"; detail: string };

export interface ScanPdfReport {
  url: string;
  websiteName: string | null;
  companyNameInput: string | null;
  scannedAt: Date | null;
  technologies: Array<{ name: string; category: string; evidence: string }>;
  seoAudit: { seoScore: number; findings: unknown } | null;
  performanceAudit: { performanceScore: number; findings: unknown } | null;
  securityAudit: { securityScore: number; findings: unknown } | null;
  uxAudit: { uxScore: number; findings: unknown } | null;
  opportunity: {
    overallOpportunityScore: number;
    band: string;
    estimatedValueMin: number | null;
    estimatedValueMax: number | null;
    estimatedTimeline: string | null;
    confidenceLevel: string;
  } | null;
  executiveReport: {
    executiveSummary: string;
    strengths: string[];
    weaknesses: string[];
    businessOpportunities: string[];
    nextSteps: string[];
  } | null;
  recommendations: Array<{ title: string; category: string; rationale: string; priority: string }>;
}

function writeFindings(doc: PDFKit.PDFDocument, findings: unknown) {
  const rows = (findings ?? []) as FindingRow[];
  for (const f of rows) {
    doc.fontSize(9).fillColor(f.status === "pass" ? "#16a34a" : f.status === "warn" ? "#d97706" : "#dc2626").text(`[${f.status.toUpperCase()}] `, { continued: true });
    doc.fillColor("#333333").text(`${f.label} — ${f.detail}`);
  }
  doc.fillColor("#000000");
}

/** A premium, single-scan Executive Opportunity Report PDF — mirrors companyProfileToPdfBuffer's structure. */
export async function scanReportToPdfBuffer(report: ScanPdfReport): Promise<Buffer> {
  const doc = new PDFDocument({ margin: 48, size: "A4" });
  const bufferPromise = collectPdfBuffer(doc);

  const title = report.websiteName || report.companyNameInput || report.url;
  doc.fontSize(22).text(title);
  doc.fontSize(10).fillColor("#666666").text(report.url);
  doc.text(`Report generated ${new Date().toLocaleString()}${report.scannedAt ? ` · Scanned ${report.scannedAt.toLocaleString()}` : ""}`);
  doc.moveDown(1);
  doc.fillColor("#000000");

  if (report.opportunity) {
    doc.fontSize(13).text("Opportunity Score");
    doc.fontSize(10).fillColor("#333333");
    doc.text(`Overall: ${report.opportunity.overallOpportunityScore}/100 (${report.opportunity.band})`);
    if (report.opportunity.estimatedValueMin != null && report.opportunity.estimatedValueMax != null) {
      doc.text(
        `Estimated investment: $${report.opportunity.estimatedValueMin.toLocaleString()} – $${report.opportunity.estimatedValueMax.toLocaleString()} (indicative only, not a quotation)`,
      );
    }
    if (report.opportunity.estimatedTimeline) doc.text(`Estimated timeline: ${report.opportunity.estimatedTimeline}`);
    doc.text(`Confidence: ${report.opportunity.confidenceLevel}`);
    doc.moveDown(0.8);
    doc.fillColor("#000000");
  }

  if (report.executiveReport) {
    doc.fontSize(13).text("Executive Summary (AI-generated)");
    doc.fontSize(10).fillColor("#333333").text(report.executiveReport.executiveSummary);
    doc.moveDown(0.6);

    if (report.executiveReport.strengths.length) {
      doc.fillColor("#000000").fontSize(11).text("Strengths");
      doc.fontSize(10).fillColor("#333333");
      report.executiveReport.strengths.forEach((s) => doc.text(`• ${s}`));
      doc.moveDown(0.4);
    }
    if (report.executiveReport.weaknesses.length) {
      doc.fillColor("#000000").fontSize(11).text("Weaknesses");
      doc.fontSize(10).fillColor("#333333");
      report.executiveReport.weaknesses.forEach((s) => doc.text(`• ${s}`));
      doc.moveDown(0.4);
    }
    if (report.executiveReport.businessOpportunities.length) {
      doc.fillColor("#000000").fontSize(11).text("Business Opportunities");
      doc.fontSize(10).fillColor("#333333");
      report.executiveReport.businessOpportunities.forEach((s) => doc.text(`• ${s}`));
      doc.moveDown(0.4);
    }
    doc.fillColor("#000000");
  }

  if (report.technologies.length > 0) {
    if (doc.y > doc.page.height - 150) doc.addPage();
    doc.fontSize(13).text("Detected Technologies (Verified)");
    doc.fontSize(9).fillColor("#333333");
    report.technologies.forEach((t) => doc.text(`${t.name} (${t.category}) — ${t.evidence}`));
    doc.moveDown(0.8);
    doc.fillColor("#000000");
  }

  if (report.seoAudit) {
    if (doc.y > doc.page.height - 150) doc.addPage();
    doc.fontSize(13).text(`SEO Findings (Verified) — Score ${report.seoAudit.seoScore}/100`);
    writeFindings(doc, report.seoAudit.findings);
    doc.moveDown(0.8);
  }

  if (report.performanceAudit) {
    if (doc.y > doc.page.height - 150) doc.addPage();
    doc.fontSize(13).text(`Performance Findings (Estimated) — Score ${report.performanceAudit.performanceScore}/100`);
    doc.fontSize(9).fillColor("#666666").text("Estimated from static response analysis — not a Lighthouse/Core Web Vitals measurement.");
    doc.fillColor("#000000");
    writeFindings(doc, report.performanceAudit.findings);
    doc.moveDown(0.8);
  }

  if (report.securityAudit) {
    if (doc.y > doc.page.height - 150) doc.addPage();
    doc.fontSize(13).text(`Security Observations (High-level) — Score ${report.securityAudit.securityScore}/100`);
    doc.fontSize(9).fillColor("#666666").text("High-level automated assessment — not a penetration test.");
    doc.fillColor("#000000");
    writeFindings(doc, report.securityAudit.findings);
    doc.moveDown(0.8);
  }

  if (report.uxAudit) {
    if (doc.y > doc.page.height - 150) doc.addPage();
    doc.fontSize(13).text(`UX Findings (Verified) — Score ${report.uxAudit.uxScore}/100`);
    writeFindings(doc, report.uxAudit.findings);
    doc.moveDown(0.8);
  }

  if (report.recommendations.length > 0) {
    if (doc.y > doc.page.height - 150) doc.addPage();
    doc.fontSize(13).text("AI Recommendations");
    doc.fontSize(10).fillColor("#333333");
    report.recommendations.forEach((r) => {
      doc.fillColor("#000000").text(`${r.title} (${r.category.replace(/_/g, " ")}, ${r.priority} priority)`);
      doc.fontSize(9).fillColor("#333333").text(r.rationale);
      doc.moveDown(0.3);
      doc.fontSize(10);
    });
    doc.fillColor("#000000");
  }

  if (report.executiveReport?.nextSteps.length) {
    if (doc.y > doc.page.height - 100) doc.addPage();
    doc.moveDown(0.4).fontSize(13).text("Next Steps");
    doc.fontSize(10).fillColor("#333333");
    report.executiveReport.nextSteps.forEach((s) => doc.text(`• ${s}`));
  }

  doc.end();
  return bufferPromise;
}
