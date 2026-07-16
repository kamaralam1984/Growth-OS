"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const PLAN_SEATS: Record<string, number> = {
  FREE: 5,
  STARTER: 15,
  GROWTH: 50,
  ENTERPRISE: 250,
};

export async function updateBillingPlan(plan: "FREE" | "STARTER" | "GROWTH" | "ENTERPRISE"): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const membership = await prisma.membership.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };
  if (membership.role !== "OWNER") {
    return { ok: false, error: "Only the organization owner can change the plan." };
  }

  try {
    await prisma.billingAccount.upsert({
      where: { organizationId: membership.organizationId },
      create: { organizationId: membership.organizationId, plan, seatsIncluded: PLAN_SEATS[plan] ?? 5 },
      update: { plan, seatsIncluded: PLAN_SEATS[plan] ?? 5 },
    });

    await logAudit({
      userId,
      organizationId: membership.organizationId,
      action: "billing.plan_updated",
      metadata: { plan },
    });

    revalidatePath("/dashboard/billing");
    return { ok: true };
  } catch (error) {
    console.error("[billing] updateBillingPlan failed:", error);
    return { ok: false, error: "Something went wrong updating the plan. Please try again." };
  }
}
