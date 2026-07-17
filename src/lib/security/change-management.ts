import { prisma } from "@/lib/prisma";
import type { ChangeRequest, ChangeType, ChangeRiskLevel, ChangeRequestStatus } from "@/generated/prisma/client";

/**
 * SOC2 CC8.1 change management — a real approval trail for production
 * changes, optionally linked to the real Deployment row it produced.
 * status only ever moves forward through a real admin action (approve/
 * reject/deploy/roll back) — never auto-advanced.
 */

export interface CreateChangeRequestInput {
  title: string;
  description: string;
  changeType: ChangeType;
  riskLevel?: ChangeRiskLevel;
  rollbackPlan?: string;
  requestedByUserId?: string;
}

export async function createChangeRequest(input: CreateChangeRequestInput): Promise<ChangeRequest> {
  return prisma.changeRequest.create({
    data: {
      title: input.title,
      description: input.description,
      changeType: input.changeType,
      riskLevel: input.riskLevel || "LOW",
      rollbackPlan: input.rollbackPlan || null,
      requestedByUserId: input.requestedByUserId || null,
    },
  });
}

export interface TransitionChangeRequestInput {
  status: ChangeRequestStatus;
  approvedByUserId?: string;
  deploymentId?: string | null;
}

const VALID_TRANSITIONS: Record<ChangeRequestStatus, ChangeRequestStatus[]> = {
  PROPOSED: ["APPROVED", "REJECTED"],
  APPROVED: ["DEPLOYED", "REJECTED"],
  REJECTED: [],
  DEPLOYED: ["ROLLED_BACK"],
  ROLLED_BACK: [],
};

export async function transitionChangeRequest(id: string, input: TransitionChangeRequestInput): Promise<ChangeRequest> {
  const existing = await prisma.changeRequest.findUniqueOrThrow({ where: { id } });
  if (!VALID_TRANSITIONS[existing.status].includes(input.status)) {
    throw new Error(`Cannot move a change request from ${existing.status} to ${input.status}.`);
  }

  return prisma.changeRequest.update({
    where: { id },
    data: {
      status: input.status,
      approvedByUserId: input.status === "APPROVED" ? input.approvedByUserId || null : undefined,
      approvedAt: input.status === "APPROVED" ? new Date() : undefined,
      deployedAt: input.status === "DEPLOYED" ? new Date() : undefined,
      deploymentId: input.status === "DEPLOYED" ? input.deploymentId || null : undefined,
    },
  });
}

export async function listChangeRequests(): Promise<ChangeRequest[]> {
  return prisma.changeRequest.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }] });
}

export interface ChangeManagementSummary {
  total: number;
  proposed: number;
  approved: number;
  deployed: number;
}

export async function getChangeManagementSummary(): Promise<ChangeManagementSummary> {
  const changes = await prisma.changeRequest.findMany({ select: { status: true } });
  let proposed = 0;
  let approved = 0;
  let deployed = 0;
  for (const c of changes) {
    if (c.status === "PROPOSED") proposed++;
    if (c.status === "APPROVED") approved++;
    if (c.status === "DEPLOYED") deployed++;
  }
  return { total: changes.length, proposed, approved, deployed };
}
