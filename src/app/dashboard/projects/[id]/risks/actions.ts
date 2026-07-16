"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { detectProjectRisks } from "@/lib/projects/risk-detection";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function resolveActiveMembership(userId: string) {
  return prisma.membership.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
}

async function resolveProjectInOrg(userId: string, projectId: string) {
  const membership = await resolveActiveMembership(userId);
  if (!membership) return null;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.organizationId !== membership.organizationId) return null;
  return { membership, project };
}

export async function runRiskDetection(projectId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveProjectInOrg(userId, projectId);
  if (!resolved) return { ok: false, error: "Project not found." };

  await detectProjectRisks(projectId);
  revalidatePath(`/dashboard/projects/${projectId}/risks`);
  return { ok: true };
}

export async function updateRiskStatus(riskId: string, status: "MITIGATED" | "RESOLVED" | "OPEN"): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const risk = await prisma.projectRisk.findUnique({ where: { id: riskId } });
  if (!risk) return { ok: false, error: "Risk not found." };
  const resolved = await resolveProjectInOrg(userId, risk.projectId);
  if (!resolved) return { ok: false, error: "Project not found." };

  await prisma.projectRisk.update({
    where: { id: riskId },
    data: { status, resolvedAt: status === "RESOLVED" ? new Date() : null },
  });
  await logAudit({ userId, organizationId: resolved.membership.organizationId, action: "projects.risk_status_updated", metadata: { riskId, status } });

  revalidatePath(`/dashboard/projects/${risk.projectId}/risks`);
  return { ok: true };
}
