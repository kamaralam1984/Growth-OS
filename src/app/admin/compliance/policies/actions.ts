"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePlatformOwner } from "@/lib/billing/platform-admin";
import { logAudit } from "@/lib/audit";
import { createPolicy, updatePolicy } from "@/lib/security/policy-center";
import type { PolicyCategory } from "@/generated/prisma/client";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const CATEGORIES = new Set<PolicyCategory>([
  "ACCESS_CONTROL",
  "DATA_PROTECTION",
  "INCIDENT_RESPONSE",
  "BUSINESS_CONTINUITY",
  "ACCEPTABLE_USE",
  "VENDOR_MANAGEMENT",
  "CHANGE_MANAGEMENT",
  "RISK_MANAGEMENT",
  "OTHER",
]);

const createSchema = z.object({
  title: z.string().trim().min(1, "Enter a title.").max(200),
  category: z.string(),
  content: z.string().trim().min(1, "Write the policy content.").max(20000),
  reviewDueAt: z.string().trim().optional(),
});

export async function createPolicyAction(input: unknown): Promise<ActionResult> {
  const { userId } = await requirePlatformOwner("/admin/compliance/policies");

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the policy fields." };
  }
  if (!CATEGORIES.has(parsed.data.category as PolicyCategory)) {
    return { ok: false, error: "Choose a valid category." };
  }

  try {
    const policy = await createPolicy({
      title: parsed.data.title,
      category: parsed.data.category as PolicyCategory,
      content: parsed.data.content,
      reviewDueAt: parsed.data.reviewDueAt ? new Date(parsed.data.reviewDueAt) : undefined,
      ownerUserId: userId,
      createdByUserId: userId,
    });
    await logAudit({ userId, action: "admin.security_policy_created", metadata: { policyId: policy.id } });
    revalidatePath("/admin/compliance/policies");
    return { ok: true };
  } catch (error) {
    console.error("[admin/compliance/policies] createPolicyAction failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

const publishSchema = z.object({
  policyId: z.string().trim().min(1),
  action: z.enum(["publish", "archive"]),
});

export async function transitionPolicyAction(input: unknown): Promise<ActionResult> {
  const { userId } = await requirePlatformOwner("/admin/compliance/policies");

  const parsed = publishSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the fields." };
  }

  try {
    await updatePolicy(parsed.data.policyId, {
      publish: parsed.data.action === "publish",
      archive: parsed.data.action === "archive",
    });
    await logAudit({ userId, action: "admin.security_policy_updated", metadata: { policyId: parsed.data.policyId, transition: parsed.data.action } });
    revalidatePath("/admin/compliance/policies");
    return { ok: true };
  } catch (error) {
    console.error("[admin/compliance/policies] transitionPolicyAction failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
