import { prisma } from "@/lib/prisma";
import { installTemplate } from "@/lib/workflows/templates";
import type { WorkflowManifest } from "../manifest-schema";

export interface WorkflowPackInstallResult {
  workflowId: string;
}

/**
 * Looks up the named real AutomationTemplate and calls the existing
 * installTemplate() verbatim — zero new workflow-install logic. Serves both
 * the WORKFLOW and AUTOMATION_TEMPLATE marketplace categories (same
 * underlying model; the category split is catalog/filtering only).
 */
export async function installWorkflowPack(organizationId: string, manifest: WorkflowManifest, createdByUserId: string): Promise<WorkflowPackInstallResult> {
  const template = await prisma.automationTemplate.findUnique({ where: { name: manifest.automationTemplateName } });
  if (!template) throw new Error(`Automation template "${manifest.automationTemplateName}" was not found.`);

  const { workflowId } = await installTemplate(template, organizationId, createdByUserId);
  return { workflowId };
}

/** Archives the installed Workflow rather than deleting it — preserves run history. */
export async function uninstallWorkflowPack(workflowId: string): Promise<void> {
  await prisma.workflow.update({ where: { id: workflowId }, data: { status: "ARCHIVED" } });
}
