"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { logAudit } from "@/lib/audit";
import { notifyOrganizationOwners } from "@/lib/notifications";
import { fireWorkflowTrigger } from "@/lib/workflows/triggers";
import { clientSchema, type ClientInput } from "@/lib/validations/company-directory";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function resolveActiveMembership(userId: string) {
  return prisma.membership.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Moves a Lead to a different PipelineStage within the same workspace —
 * powers the CRM board's drag-and-drop columns. Verifies both the lead and
 * the target stage belong to the caller's organization before writing.
 */
export async function moveLeadStage(leadId: string, targetStageId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  try {
    const [lead, targetStage] = await Promise.all([
      prisma.lead.findUnique({
        where: { id: leadId },
        include: { pipelineStage: { include: { workspace: true } } },
      }),
      prisma.pipelineStage.findUnique({ where: { id: targetStageId }, include: { workspace: true } }),
    ]);

    if (!lead || lead.pipelineStage.workspace.organizationId !== membership.organizationId) {
      return { ok: false, error: "Lead not found." };
    }
    if (!targetStage || targetStage.workspace.organizationId !== membership.organizationId) {
      return { ok: false, error: "Pipeline stage not found." };
    }

    await prisma.lead.update({ where: { id: leadId }, data: { pipelineStageId: targetStageId } });

    await logActivity({
      organizationId: membership.organizationId,
      type: "SYSTEM_EVENT",
      description: `${session.user?.name ?? "A team member"} moved ${lead.name} to ${targetStage.name}.`,
      actorUserId: userId,
      metadata: { leadId, targetStageId },
    });
    await fireWorkflowTrigger(membership.organizationId, "LEAD_UPDATED", { leadId, name: lead.name, estimatedValue: lead.estimatedValue, targetStageId, targetStageName: targetStage.name });

    if (targetStage.name === "Won") {
      await notifyOrganizationOwners({
        organizationId: membership.organizationId,
        type: "CRM_EVENT",
        title: "Deal won",
        message: `${lead.name} moved to Won${lead.estimatedValue ? ` (${lead.estimatedValue})` : ""}.`,
      });
    }

    revalidatePath("/dashboard/crm/pipeline");
    revalidatePath("/dashboard/crm");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (error) {
    console.error("[crm] moveLeadStage failed:", error);
    return { ok: false, error: "Something went wrong moving the lead. Please try again." };
  }
}

export interface CreateClientResult extends ActionResult {
  clientId?: string;
}

export async function createClient(input: ClientInput): Promise<CreateClientResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = clientSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the client details." };
  }

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };
  const organizationId = membership.organizationId;

  try {
    if (parsed.data.companyId) {
      const company = await prisma.company.findUnique({ where: { id: parsed.data.companyId } });
      if (!company || company.organizationId !== organizationId) {
        return { ok: false, error: "Selected company was not found." };
      }
    }

    const client = await prisma.client.create({
      data: {
        organizationId,
        companyId: parsed.data.companyId || null,
        name: parsed.data.name,
        email: parsed.data.email || null,
        phone: parsed.data.phone || null,
        status: parsed.data.status,
        contractValue: parsed.data.contractValue ?? null,
        notes: parsed.data.notes || null,
      },
    });

    await logActivity({
      organizationId,
      type: "SYSTEM_EVENT",
      description: `${session.user?.name ?? "A team member"} added ${client.name} as a client.`,
      actorUserId: userId,
      metadata: { clientId: client.id },
    });
    await logAudit({ userId, organizationId, action: "crm.client_created", metadata: { clientId: client.id } });

    revalidatePath("/dashboard/crm/pipeline");
    revalidatePath("/dashboard/crm");
    return { ok: true, clientId: client.id };
  } catch (error) {
    console.error("[crm] createClient failed:", error);
    return { ok: false, error: "Something went wrong creating the client. Please try again." };
  }
}

export async function updateClientStatus(
  clientId: string,
  status: "ACTIVE" | "INACTIVE" | "CHURNED",
): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  try {
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client || client.organizationId !== membership.organizationId) {
      return { ok: false, error: "Client not found." };
    }

    await prisma.client.update({ where: { id: clientId }, data: { status } });
    revalidatePath("/dashboard/crm/pipeline");
    revalidatePath("/dashboard/crm");
    return { ok: true };
  } catch (error) {
    console.error("[crm] updateClientStatus failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
