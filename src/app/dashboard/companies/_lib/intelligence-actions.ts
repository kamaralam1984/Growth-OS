"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { AINotConnectedError, AIBillingError, isAIBillingError } from "@/lib/ai/client";
import { generateCompanyIntelligence, generateResearchNote } from "@/lib/company-intelligence";
import { scoreCompany } from "@/lib/lead-scoring";
import type { ResearchTopic } from "@/generated/prisma/client";

export interface ActionResult {
  ok: boolean;
  error?: string;
  errorKind?: "not_connected" | "billing" | "generic";
}

function describeAIError(error: unknown): ActionResult {
  if (error instanceof AINotConnectedError) {
    return {
      ok: false,
      errorKind: "not_connected",
      error: "AI is not connected — no ANTHROPIC_API_KEY is configured for this environment.",
    };
  }
  if (error instanceof AIBillingError || isAIBillingError(error)) {
    return {
      ok: false,
      errorKind: "billing",
      error: "AI is connected but the account has no API credits — add credits at console.anthropic.com/settings/billing.",
    };
  }
  console.error("[companies] AI call failed:", error);
  return { ok: false, errorKind: "generic", error: "Something went wrong. Please try again." };
}

async function resolveMembershipForCompany(userId: string, companyId: string) {
  const membership = await prisma.membership.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
  if (!membership) return null;
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company || company.organizationId !== membership.organizationId) return null;
  return { membership, company };
}

/** Runs a real, live web-search-backed AI Company Intelligence report — never fabricated. */
export async function generateIntelligenceReport(companyId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveMembershipForCompany(userId, companyId);
  if (!resolved) return { ok: false, error: "Company not found." };

  if (!checkRateLimit(`company-intel:${userId}`, { limit: 15, windowMs: 5 * 60_000 }).allowed) {
    return { ok: false, errorKind: "generic", error: "Too many research requests — wait a few minutes and try again." };
  }

  try {
    await generateCompanyIntelligence(companyId);
    await logAudit({
      userId,
      organizationId: resolved.membership.organizationId,
      action: "companies.intelligence_generated",
      metadata: { companyId },
    });
    revalidatePath(`/dashboard/companies/${companyId}`);
    return { ok: true };
  } catch (error) {
    return describeAIError(error);
  }
}

/** Generates a single-topic AI research note for a company. */
export async function generateNote(companyId: string, topic: ResearchTopic): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveMembershipForCompany(userId, companyId);
  if (!resolved) return { ok: false, error: "Company not found." };

  if (!checkRateLimit(`company-note:${userId}`, { limit: 20, windowMs: 5 * 60_000 }).allowed) {
    return { ok: false, errorKind: "generic", error: "Too many research requests — wait a few minutes and try again." };
  }

  try {
    await generateResearchNote(companyId, topic);
    await logAudit({
      userId,
      organizationId: resolved.membership.organizationId,
      action: "companies.research_note_generated",
      metadata: { companyId, topic },
    });
    revalidatePath(`/dashboard/companies/${companyId}`);
    return { ok: true };
  } catch (error) {
    return describeAIError(error);
  }
}

/** Recomputes the deterministic LeadScore from current stored data — never throws (scoreCompany is fire-and-forget safe). */
export async function rescoreCompany(companyId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveMembershipForCompany(userId, companyId);
  if (!resolved) return { ok: false, error: "Company not found." };

  await scoreCompany(companyId);
  revalidatePath(`/dashboard/companies/${companyId}`);
  return { ok: true };
}
