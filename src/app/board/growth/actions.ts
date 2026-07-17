"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { resolveActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { logAudit } from "@/lib/audit";
import { AINotConnectedError, AIBillingError, isAIBillingError } from "@/lib/ai/client";
import { generateGrowthImprovementPlan } from "@/lib/growth/improvement-plan";

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
  console.error("[board/growth] AI call failed:", error);
  return { ok: false, errorKind: "generic", error: "Something went wrong generating the plan. Please try again." };
}

/** Business Analyst Agent's one AI-authored artifact — reuses generateGrowthImprovementPlan() verbatim. */
export async function generateImprovementPlan(): Promise<ActionResult & { planId?: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  try {
    const plan = await generateGrowthImprovementPlan(membership.organizationId);
    await logAudit({
      userId,
      organizationId: membership.organizationId,
      action: "business_analyst_agent.improvement_plan_generated",
      metadata: { planId: plan.id },
    });
    revalidatePath("/board/growth");
    return { ok: true, planId: plan.id };
  } catch (error) {
    return describeAIError(error);
  }
}
