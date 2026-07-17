"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePlatformOwner } from "@/lib/billing/platform-admin";
import { logAudit } from "@/lib/audit";
import { createSecurityRisk, updateSecurityRisk } from "@/lib/security/risk-register";
import type { SecurityRiskCategory, SecurityRiskStatus } from "@/generated/prisma/client";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const CATEGORIES = new Set<SecurityRiskCategory>(["DATA_SECURITY", "ACCESS_CONTROL", "THIRD_PARTY", "AVAILABILITY", "COMPLIANCE", "OPERATIONAL"]);
const STATUSES = new Set<SecurityRiskStatus>(["OPEN", "MITIGATING", "MITIGATED", "ACCEPTED"]);

const createSchema = z.object({
  title: z.string().trim().min(1, "Enter a title.").max(200),
  description: z.string().trim().min(1, "Describe the risk.").max(5000),
  category: z.string(),
  likelihood: z.coerce.number().int().min(1).max(5),
  impact: z.coerce.number().int().min(1).max(5),
  mitigationPlan: z.string().trim().max(5000).optional(),
});

export async function createSecurityRiskAction(input: unknown): Promise<ActionResult> {
  const { userId } = await requirePlatformOwner("/admin/compliance/risks");

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the risk fields." };
  }
  if (!CATEGORIES.has(parsed.data.category as SecurityRiskCategory)) {
    return { ok: false, error: "Choose a valid category." };
  }

  try {
    const risk = await createSecurityRisk({
      title: parsed.data.title,
      description: parsed.data.description,
      category: parsed.data.category as SecurityRiskCategory,
      likelihood: parsed.data.likelihood,
      impact: parsed.data.impact,
      mitigationPlan: parsed.data.mitigationPlan,
      createdByUserId: userId,
    });
    await logAudit({ userId, action: "admin.security_risk_created", metadata: { riskId: risk.id, band: risk.band } });
    revalidatePath("/admin/compliance/risks");
    return { ok: true };
  } catch (error) {
    console.error("[admin/compliance/risks] createSecurityRiskAction failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

const updateStatusSchema = z.object({
  riskId: z.string().trim().min(1),
  status: z.string(),
  mitigationPlan: z.string().trim().max(5000).optional(),
});

export async function updateSecurityRiskStatusAction(input: unknown): Promise<ActionResult> {
  const { userId } = await requirePlatformOwner("/admin/compliance/risks");

  const parsed = updateStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the fields." };
  }
  if (!STATUSES.has(parsed.data.status as SecurityRiskStatus)) {
    return { ok: false, error: "Choose a valid status." };
  }

  try {
    await updateSecurityRisk(parsed.data.riskId, {
      status: parsed.data.status as SecurityRiskStatus,
      mitigationPlan: parsed.data.mitigationPlan,
      ownerUserId: userId,
      markReviewed: true,
    });
    await logAudit({ userId, action: "admin.security_risk_updated", metadata: { riskId: parsed.data.riskId, status: parsed.data.status } });
    revalidatePath("/admin/compliance/risks");
    return { ok: true };
  } catch (error) {
    console.error("[admin/compliance/risks] updateSecurityRiskStatusAction failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
