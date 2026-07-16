"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { AINotConnectedError, AIBillingError, isAIBillingError } from "@/lib/ai/client";
import { generateRecommendations, getRecentRecommendations } from "@/lib/recommendations";
import type { Recommendation } from "@/generated/prisma/client";

export interface RecommendationsActionResult {
  ok: boolean;
  error?: string;
  errorKind?: "not_connected" | "billing" | "generic";
  recommendations?: Array<Recommendation & { relatedCompany: { id: string; name: string } | null }>;
}

function describeError(error: unknown): RecommendationsActionResult {
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
  console.error("[recommendations] generation failed:", error);
  return { ok: false, errorKind: "generic", error: "Something went wrong generating recommendations. Please try again." };
}

async function resolveActiveMembership(userId: string) {
  return prisma.membership.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
}

/** Real Claude call that (re)generates the AI Recommendations panel — rate-limited since it's billable. */
export async function refreshRecommendations(): Promise<RecommendationsActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  if (!checkRateLimit(`recommendations:${userId}`, { limit: 10, windowMs: 5 * 60_000 }).allowed) {
    return { ok: false, errorKind: "generic", error: "Too many refresh requests — wait a few minutes and try again." };
  }

  try {
    await generateRecommendations(membership.organizationId);
    await logAudit({ userId, organizationId: membership.organizationId, action: "recommendations.refreshed" });
    revalidatePath("/dashboard/lead-finder");
    revalidatePath("/dashboard/companies");
    const recommendations = await getRecentRecommendations(membership.organizationId);
    return { ok: true, recommendations };
  } catch (error) {
    return describeError(error);
  }
}
