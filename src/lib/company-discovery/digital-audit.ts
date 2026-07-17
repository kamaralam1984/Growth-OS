import { prisma } from "@/lib/prisma";
import { runWebsiteScan } from "@/lib/scanner/run-scan";

/**
 * Step 3 (Digital Audit) — 100% reuse of the existing Website Scanner engine
 * (src/lib/scanner/run-scan.ts). This is deliberately the thinnest possible
 * wrapper: create one real WebsiteScan row (optionally tied to a Company, for
 * the Phase 17 Opportunity Engine's per-lead scans — companyId stays null for
 * the org's-own-website Company DNA use case), then call the same
 * runWebsiteScan() the manually-triggered Website Scanner page already uses.
 * No new audit logic is introduced anywhere in this module.
 */
export async function runDigitalAudit(params: {
  organizationId: string;
  ownerUserId: string;
  websiteUrl: string;
  companyId?: string;
}): Promise<{ websiteScanId: string; ok: boolean }> {
  const scan = await prisma.websiteScan.create({
    data: {
      organizationId: params.organizationId,
      createdByUserId: params.ownerUserId,
      companyId: params.companyId,
      url: params.websiteUrl,
      websiteType: params.companyId ? "lead-opportunity-engine" : "company-discovery",
      status: "PENDING",
    },
  });

  const result = await runWebsiteScan(scan.id);
  return { websiteScanId: scan.id, ok: result.ok };
}

/** Short, real-numbers-only text summary of a completed WebsiteScan's audit rows — shared by the Company Understanding Engine pipeline and the Lead Opportunity Engine so both ground their AI calls in the identical real data. */
export async function summarizeWebsiteScan(websiteScanId: string): Promise<{ text: string; techFindings: string[] }> {
  const scan = await prisma.websiteScan.findUnique({
    where: { id: websiteScanId },
    include: { seoAudit: true, performanceAudit: true, securityAudit: true, uxAudit: true, opportunity: true, technologies: true },
  });
  if (!scan) return { text: "No digital audit data available.", techFindings: [] };

  const parts: string[] = [];
  if (scan.seoAudit) {
    parts.push(
      `SEO score ${scan.seoAudit.seoScore}/100 (sitemap: ${scan.seoAudit.hasSitemap}, robots.txt: ${scan.seoAudit.hasRobotsTxt}, indexable: ${scan.seoAudit.isIndexable}).`,
    );
  }
  if (scan.performanceAudit) {
    parts.push(`Performance score ${scan.performanceAudit.performanceScore}/100 (response time ${scan.performanceAudit.responseTimeMs}ms).`);
  }
  if (scan.securityAudit) {
    parts.push(
      `Security score ${scan.securityAudit.securityScore}/100 (HTTPS: ${scan.securityAudit.isHttps}, HSTS: ${scan.securityAudit.hasHsts}, CSP: ${scan.securityAudit.hasCsp}).`,
    );
  }
  if (scan.uxAudit) {
    parts.push(`UX score ${scan.uxAudit.uxScore}/100 (nav present: ${scan.uxAudit.hasNav}, CTAs found: ${scan.uxAudit.ctaCount}).`);
  }
  if (scan.opportunity) {
    parts.push(`Overall opportunity score ${scan.opportunity.overallOpportunityScore}/100 (${scan.opportunity.band}).`);
  }

  const techFindings = scan.technologies.map((t) => `${t.category}: ${t.name}`);
  return { text: parts.join(" "), techFindings };
}
