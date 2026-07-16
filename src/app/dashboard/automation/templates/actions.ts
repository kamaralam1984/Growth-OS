"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { installTemplate } from "@/lib/workflows/templates";

export interface InstallTemplateResult {
  ok: boolean;
  error?: string;
  workflowId?: string;
}

const EDITOR_ROLES = new Set(["OWNER", "ADMIN"]);

/** Installs an AutomationTemplate as a real, DRAFT Workflow — same OWNER/ADMIN gate as every other workflow-creating action in this app, since this has a real side effect (a new Workflow + WorkflowStep rows). */
export async function installTemplateAction(templateId: string): Promise<InstallTemplateResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const membership = await prisma.membership.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };
  if (!EDITOR_ROLES.has(membership.role)) return { ok: false, error: "Only owners and admins can install templates." };

  const template = await prisma.automationTemplate.findUnique({ where: { id: templateId } });
  if (!template) return { ok: false, error: "Template not found." };

  try {
    const { workflowId } = await installTemplate(template, membership.organizationId, userId);
    await logAudit({
      userId,
      organizationId: membership.organizationId,
      action: "automation.template_installed",
      metadata: { templateId, templateName: template.name, workflowId },
    });
    revalidatePath("/dashboard/automation");
    revalidatePath("/dashboard/automation/templates");
    return { ok: true, workflowId };
  } catch (error) {
    console.error("[automation/templates] installTemplateAction failed:", error);
    return { ok: false, error: error instanceof Error ? error.message : "Something went wrong installing this template." };
  }
}
