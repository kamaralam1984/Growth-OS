"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { resolveActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { logAudit } from "@/lib/audit";
import { AINotConnectedError, AIBillingError, isAIBillingError } from "@/lib/ai/client";
import { generateCustomerSuccessDigest } from "@/lib/ai/customer-success-agent";

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
  console.error("[dashboard/clients] Customer Success Agent digest failed:", error);
  return { ok: false, errorKind: "generic", error: "Something went wrong generating the digest. Please try again." };
}

/** Customer Success Agent — real portfolio digest over already-computed client health/churn/opportunity data. */
export async function generateCustomerSuccessDigestAction(): Promise<ActionResult & { briefingId?: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  try {
    const briefing = await generateCustomerSuccessDigest(membership.organizationId);
    await logAudit({
      userId,
      organizationId: membership.organizationId,
      action: "customer_success_agent.digest_generated",
      metadata: { briefingId: briefing.id },
    });
    revalidatePath("/dashboard/clients");
    revalidatePath("/board/brief");
    return { ok: true, briefingId: briefing.id };
  } catch (error) {
    return describeAIError(error);
  }
}
