"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { resolveActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { logAudit } from "@/lib/audit";
import { initiateAccessReview, decideAccessReviewEntry, completeAccessReview } from "@/lib/security/access-review";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function requireOwnerOrAdmin() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { error: "You must be signed in." } as const;

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { error: "You don't belong to an organization yet." } as const;
  if (membership.role !== "OWNER" && membership.role !== "ADMIN") {
    return { error: "Only owners and admins can run access reviews." } as const;
  }
  return { userId, membership } as const;
}

const startSchema = z.object({ periodLabel: z.string().trim().min(1, "Give this review a period label.").max(60) });

export async function startAccessReviewAction(input: unknown): Promise<ActionResult & { reviewId?: string }> {
  const auth_ = await requireOwnerOrAdmin();
  if ("error" in auth_) return { ok: false, error: auth_.error };

  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the fields." };

  try {
    const review = await initiateAccessReview(auth_.membership.organizationId, auth_.userId, parsed.data.periodLabel);
    await logAudit({ userId: auth_.userId, organizationId: auth_.membership.organizationId, action: "access_review.started", metadata: { reviewId: review.id } });
    revalidatePath("/dashboard/crm/team/access-review");
    return { ok: true, reviewId: review.id };
  } catch (error) {
    console.error("[access-review] startAccessReviewAction failed:", error);
    return { ok: false, error: "Something went wrong starting the review." };
  }
}

const decideSchema = z.object({
  reviewId: z.string().trim().min(1),
  membershipId: z.string().trim().min(1),
  decision: z.enum(["CONFIRMED", "REVOKED"]),
});

export async function decideAccessReviewEntryAction(input: unknown): Promise<ActionResult> {
  const auth_ = await requireOwnerOrAdmin();
  if ("error" in auth_) return { ok: false, error: auth_.error };

  const parsed = decideSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the fields." };

  try {
    await decideAccessReviewEntry(parsed.data.reviewId, auth_.membership.organizationId, parsed.data.membershipId, parsed.data.decision);
    await logAudit({
      userId: auth_.userId,
      organizationId: auth_.membership.organizationId,
      action: "access_review.entry_decided",
      metadata: { reviewId: parsed.data.reviewId, membershipId: parsed.data.membershipId, decision: parsed.data.decision },
    });
    revalidatePath("/dashboard/crm/team/access-review");
    revalidatePath("/dashboard/crm/team");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not record the decision." };
  }
}

const completeSchema = z.object({ reviewId: z.string().trim().min(1) });

export async function completeAccessReviewAction(input: unknown): Promise<ActionResult> {
  const auth_ = await requireOwnerOrAdmin();
  if ("error" in auth_) return { ok: false, error: auth_.error };

  const parsed = completeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Missing review." };

  try {
    await completeAccessReview(parsed.data.reviewId, auth_.membership.organizationId);
    await logAudit({ userId: auth_.userId, organizationId: auth_.membership.organizationId, action: "access_review.completed", metadata: { reviewId: parsed.data.reviewId } });
    revalidatePath("/dashboard/crm/team/access-review");
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not complete the review." };
  }
}
