"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { logActivity } from "@/lib/activity";
import { checkRateLimit } from "@/lib/rate-limit";
import { startScanSchema, type StartScanInput } from "@/lib/validations/scanner";
import { runWebsiteScan } from "@/lib/scanner/run-scan";
import { researchKeywords } from "@/lib/seo/agent";
import { addCompanyToCrm, assignCompanyOwner, markCompanyPriority } from "@/app/dashboard/companies/actions";
import { addCompanyTimelineEvent } from "@/lib/company-intelligence";
import { scoreCompany } from "@/lib/lead-scoring";
import type { WebsiteScan, Technology } from "@/generated/prisma/client";
import { resolveActiveMembership } from "@/app/dashboard/_lib/require-membership";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function resolveScanInOrg(userId: string, scanId: string) {
  const membership = await resolveActiveMembership(userId);
  if (!membership) return null;
  const scan = await prisma.websiteScan.findUnique({ where: { id: scanId }, include: { technologies: true } });
  if (!scan || scan.organizationId !== membership.organizationId) return null;
  return { membership, scan };
}

/** Creates (if not already linked) a real Company from the scan's real + user-provided data, and returns its id. */
async function ensureScanCompany(scan: WebsiteScan & { technologies: Technology[] }, organizationId: string): Promise<string> {
  if (scan.companyId) return scan.companyId;

  const hostname = (() => {
    try {
      return new URL(scan.finalUrl ?? scan.url).hostname;
    } catch {
      return scan.url;
    }
  })();

  const company = await prisma.company.create({
    data: {
      organizationId,
      name: scan.companyNameInput || scan.websiteName || hostname,
      website: scan.finalUrl ?? scan.url,
      industry: scan.industryInput || null,
      technologies: scan.technologies.map((t) => t.name),
      source: "WEBSITE_SCANNER",
      status: "PROSPECT",
    },
  });

  await prisma.websiteScan.update({ where: { id: scan.id }, data: { companyId: company.id } });
  await addCompanyTimelineEvent({
    companyId: company.id,
    type: "CREATED",
    title: `${company.name} discovered via Website Scanner`,
    source: "AI_RESEARCH",
  });
  await scoreCompany(company.id);

  return company.id;
}

export interface StartScanResult extends ActionResult {
  scanId?: string;
  aiReportError?: { kind: "not_connected" | "billing" | "generic"; message: string };
}

/** Runs a real website scan synchronously — real fetch, real analysis, one real AI reasoning pass. */
export async function startScan(input: StartScanInput): Promise<StartScanResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = startScanSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the scan details." };
  }

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  if (!checkRateLimit(`website-scan:${userId}`, { limit: 8, windowMs: 15 * 60_000 }).allowed) {
    return { ok: false, error: "Too many scans — wait a few minutes and try again." };
  }

  const scan = await prisma.websiteScan.create({
    data: {
      organizationId: membership.organizationId,
      createdByUserId: userId,
      url: parsed.data.url,
      websiteName: parsed.data.websiteName || null,
      companyNameInput: parsed.data.companyNameInput || null,
      industryInput: parsed.data.industryInput || null,
      websiteType: parsed.data.websiteType || null,
      status: "PENDING",
    },
  });

  await logActivity({
    organizationId: membership.organizationId,
    type: "SYSTEM_EVENT",
    description: `${session.user?.name ?? "A team member"} scanned ${parsed.data.url}.`,
    actorUserId: userId,
    metadata: { scanId: scan.id, url: parsed.data.url },
  });

  const result = await runWebsiteScan(scan.id);

  await logAudit({
    userId,
    organizationId: membership.organizationId,
    action: "website_scanner.scan_run",
    metadata: { scanId: scan.id, ok: result.ok },
  });

  revalidatePath("/dashboard/website-scanner");
  return {
    ok: result.ok,
    scanId: scan.id,
    aiReportError: result.aiReportError,
    error: result.ok ? undefined : "Could not scan that website — check the URL and try again.",
  };
}

export interface KeywordResearchResult extends ActionResult {
  researchId?: string;
}

/** SEO Agent — real two-pass web-search keyword research, persisted to SeoKeywordResearch. */
export async function researchSeoKeywords(topic: string): Promise<KeywordResearchResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const trimmedTopic = topic.trim();
  if (!trimmedTopic) return { ok: false, error: "Enter a topic or keyword seed to research." };
  if (trimmedTopic.length > 200) return { ok: false, error: "Keep the topic under 200 characters." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  if (!checkRateLimit(`seo-keyword-research:${userId}`, { limit: 8, windowMs: 15 * 60_000 }).allowed) {
    return { ok: false, error: "Too many keyword research runs — wait a few minutes and try again." };
  }

  try {
    const research = await researchKeywords({ organizationId: membership.organizationId, topic: trimmedTopic });

    await logAudit({
      userId,
      organizationId: membership.organizationId,
      action: "seo_agent.keyword_research_run",
      metadata: { researchId: research.id, topic: trimmedTopic },
    });

    revalidatePath("/dashboard/website-scanner");
    return { ok: true, researchId: research.id };
  } catch (error) {
    console.error("[seo-agent] researchSeoKeywords failed:", error);
    return { ok: false, error: "Something went wrong researching keywords. Please try again." };
  }
}

export async function deleteScan(scanId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveScanInOrg(userId, scanId);
  if (!resolved) return { ok: false, error: "Scan not found." };

  await prisma.websiteScan.delete({ where: { id: scanId } });
  revalidatePath("/dashboard/website-scanner");
  return { ok: true };
}

export interface SaveScanToCrmResult extends ActionResult {
  companyId?: string;
  leadId?: string;
  alreadyInCrm?: boolean;
}

/** "Save Report → Create Lead" — links/creates a real Company from the scan, then reuses addCompanyToCrm verbatim. */
export async function saveScanToCrm(scanId: string): Promise<SaveScanToCrmResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveScanInOrg(userId, scanId);
  if (!resolved) return { ok: false, error: "Scan not found." };

  try {
    const companyId = await ensureScanCompany(resolved.scan, resolved.membership.organizationId);
    const crmResult = await addCompanyToCrm(companyId);

    await logAudit({
      userId,
      organizationId: resolved.membership.organizationId,
      action: "website_scanner.saved_to_crm",
      metadata: { scanId, companyId },
    });

    revalidatePath("/dashboard/website-scanner");
    revalidatePath(`/dashboard/website-scanner/${scanId}`);
    revalidatePath("/dashboard/companies");
    return { ok: crmResult.ok, companyId, leadId: crmResult.leadId, alreadyInCrm: crmResult.alreadyInCrm, error: crmResult.error };
  } catch (error) {
    console.error("[website-scanner] saveScanToCrm failed:", error);
    return { ok: false, error: "Something went wrong saving this to the CRM. Please try again." };
  }
}

export async function assignScanOwner(scanId: string, ownerUserId: string | null): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveScanInOrg(userId, scanId);
  if (!resolved) return { ok: false, error: "Scan not found." };

  const companyId = await ensureScanCompany(resolved.scan, resolved.membership.organizationId);
  const result = await assignCompanyOwner(companyId, ownerUserId);
  revalidatePath(`/dashboard/website-scanner/${scanId}`);
  return result;
}

export async function markScanPriority(scanId: string, priority: "LOW" | "NORMAL" | "HIGH" | "URGENT"): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveScanInOrg(userId, scanId);
  if (!resolved) return { ok: false, error: "Scan not found." };

  const companyId = await ensureScanCompany(resolved.scan, resolved.membership.organizationId);
  const result = await markCompanyPriority(companyId, priority);
  revalidatePath(`/dashboard/website-scanner/${scanId}`);
  return result;
}

export interface GenerateProposalResult extends ActionResult {
  proposalId?: string;
}

/** "Generate Proposal Request" — a real DRAFT Proposal, templated from the real AI Executive Report + recommendations. */
export async function generateProposalFromScan(scanId: string): Promise<GenerateProposalResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  const scan = await prisma.websiteScan.findUnique({
    where: { id: scanId },
    include: { technologies: true, executiveReport: true, recommendations: true, opportunity: true },
  });
  if (!scan || scan.organizationId !== membership.organizationId) return { ok: false, error: "Scan not found." };
  if (!scan.executiveReport) return { ok: false, error: "Generate the AI Executive Report first." };

  try {
    const companyId = await ensureScanCompany(scan, membership.organizationId);

    const contentParts = [
      scan.executiveReport.executiveSummary,
      "",
      "Recommended Solutions:",
      ...scan.recommendations.map((r) => `- ${r.title} (${r.category}): ${r.rationale}`),
      "",
      "Next Steps:",
      ...scan.executiveReport.nextSteps.map((s) => `- ${s}`),
    ];

    const midpointValue =
      scan.opportunity?.estimatedValueMin != null && scan.opportunity?.estimatedValueMax != null
        ? (scan.opportunity.estimatedValueMin + scan.opportunity.estimatedValueMax) / 2
        : null;

    const proposal = await prisma.proposal.create({
      data: {
        organizationId: membership.organizationId,
        companyId,
        title: `Digital Transformation Proposal — ${scan.companyNameInput || scan.websiteName || scan.finalUrl || scan.url}`,
        content: contentParts.join("\n"),
        status: "DRAFT",
        value: midpointValue,
        createdByUserId: userId,
      },
    });

    await logAudit({
      userId,
      organizationId: membership.organizationId,
      action: "website_scanner.proposal_generated",
      metadata: { scanId, proposalId: proposal.id },
    });

    revalidatePath("/dashboard/proposal");
    revalidatePath("/dashboard/proposal/proposals");
    revalidatePath(`/dashboard/website-scanner/${scanId}`);
    return { ok: true, proposalId: proposal.id };
  } catch (error) {
    console.error("[website-scanner] generateProposalFromScan failed:", error);
    return { ok: false, error: "Something went wrong generating the proposal. Please try again." };
  }
}
