"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { resolveActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { checkRateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { AINotConnectedError, AIBillingError, isAIBillingError } from "@/lib/ai/client";
import { generateResearchBrief } from "@/lib/ai/research-agent";

export interface ActionResult {
  ok: boolean;
  error?: string;
  errorKind?: "not_connected" | "billing" | "generic";
}

function describeAIError(error: unknown): ActionResult {
  if (error instanceof AINotConnectedError) {
    return { ok: false, errorKind: "not_connected", error: "AI is not connected — no ANTHROPIC_API_KEY is configured for this environment." };
  }
  if (error instanceof AIBillingError || isAIBillingError(error)) {
    return { ok: false, errorKind: "billing", error: "AI is connected but the account has no API credits." };
  }
  console.error("[board/intelligence] Research Agent call failed:", error);
  return { ok: false, errorKind: "generic", error: "Something went wrong researching that topic. Please try again." };
}

/** Research Agent — ad-hoc, on-demand company/topic research via live web search. */
export async function runResearchBrief(topic: string): Promise<ActionResult & { briefId?: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const trimmedTopic = topic.trim();
  if (!trimmedTopic) return { ok: false, error: "Enter a company or topic to research." };
  if (trimmedTopic.length > 200) return { ok: false, error: "Keep the topic under 200 characters." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  if (!checkRateLimit(`research-agent:${userId}`, { limit: 8, windowMs: 15 * 60_000 }).allowed) {
    return { ok: false, error: "Too many research briefs — wait a few minutes and try again." };
  }

  try {
    const brief = await generateResearchBrief(membership.organizationId, trimmedTopic);
    await logAudit({
      userId,
      organizationId: membership.organizationId,
      action: "research_agent.brief_generated",
      metadata: { briefId: brief.id, topic: trimmedTopic },
    });
    revalidatePath("/board/intelligence");
    return { ok: true, briefId: brief.id };
  } catch (error) {
    return describeAIError(error);
  }
}
