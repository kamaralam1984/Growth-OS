"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePlatformOwner } from "@/lib/billing/platform-admin";
import { logAudit } from "@/lib/audit";
import { createChangeRequest, transitionChangeRequest } from "@/lib/security/change-management";
import type { ChangeType, ChangeRiskLevel, ChangeRequestStatus } from "@/generated/prisma/client";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const CHANGE_TYPES = new Set<ChangeType>(["FEATURE", "BUGFIX", "INFRASTRUCTURE", "SECURITY", "CONFIGURATION", "EMERGENCY"]);
const RISK_LEVELS = new Set<ChangeRiskLevel>(["LOW", "MEDIUM", "HIGH"]);
const STATUSES = new Set<ChangeRequestStatus>(["PROPOSED", "APPROVED", "REJECTED", "DEPLOYED", "ROLLED_BACK"]);

const createSchema = z.object({
  title: z.string().trim().min(1, "Enter a title.").max(200),
  description: z.string().trim().min(1, "Describe the change.").max(5000),
  changeType: z.string(),
  riskLevel: z.string(),
  rollbackPlan: z.string().trim().max(5000).optional(),
});

export async function createChangeRequestAction(input: unknown): Promise<ActionResult> {
  const { userId } = await requirePlatformOwner("/admin/compliance/changes");

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the change request fields." };
  }
  if (!CHANGE_TYPES.has(parsed.data.changeType as ChangeType) || !RISK_LEVELS.has(parsed.data.riskLevel as ChangeRiskLevel)) {
    return { ok: false, error: "Choose a valid change type/risk level." };
  }

  try {
    const change = await createChangeRequest({
      title: parsed.data.title,
      description: parsed.data.description,
      changeType: parsed.data.changeType as ChangeType,
      riskLevel: parsed.data.riskLevel as ChangeRiskLevel,
      rollbackPlan: parsed.data.rollbackPlan,
      requestedByUserId: userId,
    });
    await logAudit({ userId, action: "admin.change_request_created", metadata: { changeId: change.id } });
    revalidatePath("/admin/compliance/changes");
    return { ok: true };
  } catch (error) {
    console.error("[admin/compliance/changes] createChangeRequestAction failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

const transitionSchema = z.object({
  changeId: z.string().trim().min(1),
  status: z.string(),
});

export async function transitionChangeRequestAction(input: unknown): Promise<ActionResult> {
  const { userId } = await requirePlatformOwner("/admin/compliance/changes");

  const parsed = transitionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the fields." };
  }
  if (!STATUSES.has(parsed.data.status as ChangeRequestStatus)) {
    return { ok: false, error: "Choose a valid status." };
  }

  try {
    await transitionChangeRequest(parsed.data.changeId, {
      status: parsed.data.status as ChangeRequestStatus,
      approvedByUserId: userId,
    });
    await logAudit({ userId, action: "admin.change_request_transitioned", metadata: { changeId: parsed.data.changeId, status: parsed.data.status } });
    revalidatePath("/admin/compliance/changes");
    return { ok: true };
  } catch (error) {
    console.error("[admin/compliance/changes] transitionChangeRequestAction failed:", error);
    return { ok: false, error: error instanceof Error ? error.message : "Something went wrong. Please try again." };
  }
}
