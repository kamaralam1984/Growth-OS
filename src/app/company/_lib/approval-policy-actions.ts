"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import type { ApprovalPolicyMode, DocumentKind } from "@/generated/prisma/client";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const EDITOR_ROLES = new Set(["OWNER", "ADMIN"]);

const updateApprovalPolicySchema = z.object({
  mode: z.enum(["ADVISORY", "APPROVAL_REQUIRED"]),
  appliesToDocKinds: z.array(z.enum(["PROPOSAL", "QUOTATION", "CONTRACT", "INVOICE"])),
  allowOwnerOverride: z.boolean(),
});

export type UpdateApprovalPolicyInput = z.infer<typeof updateApprovalPolicySchema>;

async function requireEditableOrganization(orgId: string, userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const membership = await prisma.membership.findUnique({ where: { userId_organizationId: { userId, organizationId: orgId } } });
  if (!membership || membership.status !== "ACTIVE") return { ok: false, error: "You do not have access to this organization." };
  if (!EDITOR_ROLES.has(membership.role)) return { ok: false, error: "Only owners and admins can change the approval policy." };
  return { ok: true };
}

/** Configures the reusable Approval Engine (src/lib/approval-engine.ts) for this org — Advisory (informational only) vs Approval Required (blocks Send until the AI Board approves or an owner overrides with a reason). */
export async function updateApprovalPolicy(orgId: string, input: UpdateApprovalPolicyInput): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = updateApprovalPolicySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the approval policy." };

  const access = await requireEditableOrganization(orgId, userId);
  if (!access.ok) return access;

  try {
    await prisma.organizationApprovalPolicy.upsert({
      where: { organizationId: orgId },
      create: {
        organizationId: orgId,
        mode: parsed.data.mode as ApprovalPolicyMode,
        appliesToDocKinds: parsed.data.appliesToDocKinds as DocumentKind[],
        allowOwnerOverride: parsed.data.allowOwnerOverride,
        updatedByUserId: userId,
      },
      update: {
        mode: parsed.data.mode as ApprovalPolicyMode,
        appliesToDocKinds: parsed.data.appliesToDocKinds as DocumentKind[],
        allowOwnerOverride: parsed.data.allowOwnerOverride,
        updatedByUserId: userId,
      },
    });
    await logAudit({ userId, organizationId: orgId, action: "approval_policy.updated", metadata: { ...parsed.data } });
    revalidatePath("/company");
    return { ok: true };
  } catch (error) {
    console.error("[company] updateApprovalPolicy failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
