"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { logAudit } from "@/lib/audit";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function resolveAlertInOrg(userId: string, alertId: string) {
  const membership = await resolveActiveMembership(userId);
  if (!membership) return null;
  const alert = await prisma.alert.findUnique({ where: { id: alertId } });
  if (!alert || alert.organizationId !== membership.organizationId) return null;
  return { membership, alert };
}

export async function acknowledgeAlert(alertId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveAlertInOrg(userId, alertId);
  if (!resolved) return { ok: false, error: "Alert not found." };
  if (resolved.alert.status !== "ACTIVE") return { ok: false, error: "Only active alerts can be acknowledged." };

  await prisma.alert.update({
    where: { id: alertId },
    data: { status: "ACKNOWLEDGED", acknowledgedAt: new Date(), acknowledgedByUserId: userId },
  });
  await logAudit({ userId, organizationId: resolved.membership.organizationId, action: "alerts.acknowledged", metadata: { alertId } });

  revalidatePath("/dashboard/alerts");
  return { ok: true };
}

export async function resolveAlert(alertId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveAlertInOrg(userId, alertId);
  if (!resolved) return { ok: false, error: "Alert not found." };
  if (resolved.alert.status === "RESOLVED") return { ok: false, error: "Alert is already resolved." };

  await prisma.alert.update({
    where: { id: alertId },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  });
  await logAudit({ userId, organizationId: resolved.membership.organizationId, action: "alerts.resolved", metadata: { alertId } });

  revalidatePath("/dashboard/alerts");
  return { ok: true };
}
