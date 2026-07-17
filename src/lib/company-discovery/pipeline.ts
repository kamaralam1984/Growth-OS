import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { notifyOrganizationOwners } from "@/lib/notifications";
import { publishRealtimeEvent } from "@/lib/realtime/event-bus";
import { isAIConnected, AINotConnectedError } from "@/lib/ai/client";
import { startCompanyDNAExecutiveMeeting } from "@/lib/ai/meeting-lifecycle";
import type { Prisma } from "@/generated/prisma/client";

import { crawlWebsite } from "./crawler";
import { extractBrandAssets } from "./brand-extractor";
import { runDigitalAudit, summarizeWebsiteScan } from "./digital-audit";
import { researchLinkedInCompany } from "./linkedin-research";
import { synthesizeBusinessUnderstanding, collectUnknownFields } from "./business-understanding";
import { discoverCompetitors } from "./competitor-discovery";
import { generateSWOT, identifyOpportunities } from "./swot-opportunities";
import { proposeDraftConfiguration } from "./draft-configuration";

/**
 * The orchestrator for the AI Company Understanding Engine — runs the whole
 * approved pipeline end to end for one CompanyDiscoveryRun:
 *
 *   Website → AI Analysis → Company DNA → Executive Board Meeting
 *     → AI Recommendations → Draft Configuration → (ends here, AWAITING_REVIEW)
 *
 * Owner Review / Approve / Production Activation happens separately, in
 * src/app/dashboard/settings/company-dna/actions.ts + auto-configure.ts —
 * this file never writes a live CRM stage, dashboard widget, KB article, or
 * workflow. Every step below reuses an existing engine wherever one already
 * exists (see the approved plan's §1 table) — only the crawler, brand
 * extractor, and the discovery-specific AI calls are net-new.
 *
 * Runs to completion or fails cleanly — never leaves a half-populated
 * OrganizationDNA in AWAITING_REVIEW (plan §14, Failure Recovery).
 */
export async function runCompanyDiscovery(runId: string): Promise<void> {
  const run = await prisma.companyDiscoveryRun.findUnique({ where: { id: runId }, include: { organization: true } });
  if (!run) return;

  const org = run.organization;
  const organizationId = org.id;

  try {
    if (!isAIConnected()) throw new AINotConnectedError();
    if (!org.website) throw new Error("This organization has no website configured yet.");

    const owner = await prisma.membership.findFirst({
      where: { organizationId, status: "ACTIVE", role: "OWNER" },
      orderBy: { createdAt: "asc" },
      select: { userId: true },
    });
    if (!owner) throw new Error("No active OWNER membership found for this organization.");

    await logAudit({ organizationId, action: "company_discovery.started", metadata: { runId } });

    // ---- Step 1-2: crawl + brand/contact extraction ----
    await updateProgress(runId, organizationId, "CRAWLING", "Crawling the website");
    const crawl = await crawlWebsite(org.website);
    if (crawl.pages.length === 0) {
      throw new Error(crawl.homepageFetchError ?? "Could not crawl any pages from the website.");
    }
    const brandAssets = extractBrandAssets(crawl.pages);

    // ---- Step 3: digital audit — 100% reuse of the Website Scanner engine ----
    await updateProgress(runId, organizationId, "ANALYZING", "Running the digital audit (SEO, performance, security, UX, tech)");
    const audit = await runDigitalAudit({ organizationId, ownerUserId: owner.userId, websiteUrl: org.website });
    const auditSummary = await summarizeWebsiteScan(audit.websiteScanId);

    // ---- Step 4: LinkedIn — web-search only, only if a URL was given ----
    let linkedinInsights = null;
    if (org.linkedin) {
      await updateProgress(runId, organizationId, "ANALYZING", "Researching publicly available LinkedIn information");
      const linkedinResult = await researchLinkedInCompany({ organizationId, linkedinUrl: org.linkedin, companyName: org.name });
      linkedinInsights = linkedinResult.insights;
    }

    // ---- Step 5 + 7: business understanding + ICP ----
    await updateProgress(runId, organizationId, "ANALYZING", "Understanding the business");
    const { businessUnderstanding, icp } = await synthesizeBusinessUnderstanding({
      organizationId,
      pages: crawl.pages,
      brandAssets,
      linkedinInsights,
    });

    // ---- Step 8: competitors (capped at 5, AI web-search summaries) ----
    await updateProgress(runId, organizationId, "ANALYZING", "Researching competitors");
    const competitors = await discoverCompetitors({
      organizationId,
      companyName: org.name,
      websiteUrl: org.website,
      industry: businessUnderstanding.industry,
      services: businessUnderstanding.primaryServices,
    });

    // ---- Step 9 + 10: SWOT + business opportunities ----
    await updateProgress(runId, organizationId, "ANALYZING", "Generating SWOT analysis and business opportunities");
    const swot = await generateSWOT({ organizationId, businessUnderstanding, competitors, digitalAuditSummary: auditSummary.text });
    const opportunities = await identifyOpportunities({
      organizationId,
      businessUnderstanding,
      digitalAuditSummary: auditSummary.text,
      techFindings: auditSummary.techFindings,
    });

    // ---- Draft configuration proposal (decides only — never writes live rows) ----
    await updateProgress(runId, organizationId, "ANALYZING", "Drafting configuration suggestions");
    const draftConfiguration = await proposeDraftConfiguration({ organizationId, companyName: org.name, businessUnderstanding });

    const unknownFields = [
      ...collectUnknownFields("businessUnderstanding", businessUnderstanding),
      ...collectUnknownFields("icp", icp),
      ...(linkedinInsights ? [] : ["linkedinInsights"]),
    ];
    const confidence = {
      businessUnderstanding: businessUnderstanding.confidenceScore,
      icp: icp.confidenceScore,
      swot: swot.confidenceScore,
      opportunities: opportunities.confidenceScore,
    };

    // ---- Step 11: assemble Company DNA ----
    await updateProgress(runId, organizationId, "ANALYZING", "Assembling Company DNA");
    const dna = await prisma.organizationDNA.create({
      data: {
        organizationId,
        crawledPages: crawl.pages.map((p) => ({ url: p.url, pageType: p.pageType, title: p.title })) as unknown as Prisma.InputJsonValue,
        brandAssets: brandAssets as unknown as Prisma.InputJsonValue,
        websiteScanId: audit.websiteScanId,
        businessUnderstanding: businessUnderstanding as unknown as Prisma.InputJsonValue,
        linkedinInsights: linkedinInsights as unknown as Prisma.InputJsonValue,
        icp: icp as unknown as Prisma.InputJsonValue,
        swot: swot as unknown as Prisma.InputJsonValue,
        opportunities: opportunities as unknown as Prisma.InputJsonValue,
        confidence: confidence as unknown as Prisma.InputJsonValue,
        unknownFields,
        draftConfiguration: draftConfiguration as unknown as Prisma.InputJsonValue,
        competitors: {
          create: competitors.map((c) => ({
            name: c.name,
            website: c.website,
            strengths: c.strengths,
            weaknesses: c.weaknesses,
            positioning: c.positioning,
            verificationMethod: "ai-web-search",
          })),
        },
      },
    });
    await prisma.companyDiscoveryRun.update({ where: { id: runId }, data: { dnaId: dna.id } });

    // ---- Step 13: Executive Board meeting — automatic, before human review ----
    await updateProgress(runId, organizationId, "ANALYZING", "Convening the AI Executive Board");
    const primaryServices = businessUnderstanding.primaryServices.slice(0, 5).join(", ");
    const businessSummary = businessUnderstanding.industry
      ? `${businessUnderstanding.industry} business — ${primaryServices || "services not clearly identified from available sources"}`
      : "Business profile could not be fully determined from the available sources.";
    const meetingResult = await startCompanyDNAExecutiveMeeting({ organizationId, companyName: org.name, businessSummary });
    if (meetingResult.meetingId) {
      await prisma.organizationDNA.update({ where: { id: dna.id }, data: { executiveMeetingId: meetingResult.meetingId } });
    }

    // ---- Done — hand off to Owner Review ----
    await prisma.companyDiscoveryRun.update({
      where: { id: runId },
      data: { status: "AWAITING_REVIEW", currentStep: "Awaiting your review", completedAt: new Date() },
    });
    publishRealtimeEvent({ kind: "company_discovery_progress", organizationId });

    await logAudit({ organizationId, action: "company_dna.awaiting_review", metadata: { runId, dnaId: dna.id } });
    await notifyOrganizationOwners({
      organizationId,
      type: "COMPANY_DNA_READY",
      title: "Your Company DNA is ready for review",
      message: `AI finished analyzing ${org.name}. Review and approve the generated profile and configuration suggestions before anything goes live.`,
    });
    await logAudit({ organizationId, action: "company_discovery.completed", metadata: { runId, dnaId: dna.id } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Company discovery failed for an unknown reason.";
    await prisma.companyDiscoveryRun.update({
      where: { id: runId },
      data: { status: "FAILED", errorMessage: message, completedAt: new Date() },
    });
    publishRealtimeEvent({ kind: "company_discovery_progress", organizationId });
    await logAudit({ organizationId, action: "company_discovery.failed", metadata: { runId, error: message } });
  }
}

async function updateProgress(
  runId: string,
  organizationId: string,
  status: "PENDING" | "CRAWLING" | "ANALYZING" | "AWAITING_REVIEW" | "APPROVED" | "REJECTED" | "FAILED",
  currentStep: string,
): Promise<void> {
  await prisma.companyDiscoveryRun.update({ where: { id: runId }, data: { status, currentStep } });
  publishRealtimeEvent({ kind: "company_discovery_progress", organizationId });
}
