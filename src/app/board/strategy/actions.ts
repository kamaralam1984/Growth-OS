"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { logAudit } from "@/lib/audit";
import { AINotConnectedError, AIBillingError, isAIBillingError } from "@/lib/ai/client";
import { generateStrategicPlan } from "@/lib/strategy/planning";
import type { MembershipRole, StrategicPlanHorizon } from "@/generated/prisma/client";

export interface ActionResult {
  ok: boolean;
  error?: string;
  errorKind?: "not_connected" | "billing" | "generic";
}

// Strategic plans shape company direction — same OWNER/ADMIN gate as every
// other board-mutating action (src/app/board/actions.ts's BOARD_EDITOR_ROLES).
const STRATEGY_EDITOR_ROLES = new Set<MembershipRole>(["OWNER", "ADMIN"]);

function describeAIError(error: unknown): ActionResult {
  if (error instanceof AINotConnectedError) {
    return { ok: false, errorKind: "not_connected", error: "AI is not connected — no ANTHROPIC_API_KEY is configured for this environment." };
  }
  if (error instanceof AIBillingError || isAIBillingError(error)) {
    return { ok: false, errorKind: "billing", error: "AI is connected but the account has no API credits." };
  }
  console.error("[board/strategy] AI call failed:", error);
  return { ok: false, errorKind: "generic", error: "Something went wrong generating the plan. Please try again." };
}

export async function generatePlan(horizon: StrategicPlanHorizon): Promise<ActionResult & { planId?: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };
  if (!STRATEGY_EDITOR_ROLES.has(membership.role)) return { ok: false, error: "Only owners/admins can generate strategic plans." };

  try {
    const plan = await generateStrategicPlan(membership.organizationId, horizon);
    await logAudit({ userId, organizationId: membership.organizationId, action: "strategy.plan_generated", metadata: { planId: plan.id, horizon } });
    revalidatePath("/board/strategy");
    return { ok: true, planId: plan.id };
  } catch (error) {
    return describeAIError(error);
  }
}

export async function reviewPlan(planId: string, decision: "ACTIVE" | "ARCHIVED"): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };
  if (!STRATEGY_EDITOR_ROLES.has(membership.role)) return { ok: false, error: "Only owners/admins can review strategic plans." };

  const plan = await prisma.strategicPlan.findUnique({ where: { id: planId }, select: { organizationId: true } });
  if (!plan || plan.organizationId !== membership.organizationId) return { ok: false, error: "Plan not found." };

  await prisma.strategicPlan.update({
    where: { id: planId },
    data: { status: decision, reviewedByUserId: userId, reviewedAt: new Date() },
  });
  await logAudit({ userId, organizationId: membership.organizationId, action: "strategy.plan_reviewed", metadata: { planId, decision } });

  revalidatePath("/board/strategy");
  revalidatePath(`/board/strategy/${planId}`);
  return { ok: true };
}
