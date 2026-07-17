import { prisma } from "@/lib/prisma";
import { installDocumentTemplatePack } from "./document-template-pack";
import { installDashboardPack } from "./dashboard-pack";
import { installWorkflowPack } from "./workflow-pack";
import { installKnowledgePack } from "./knowledge-pack";
import type { IndustryPackManifest } from "../manifest-schema";

export interface IndustryPackInstallResult {
  documentTemplateIds: string[];
  dashboardTemplateIds: string[];
  workflowIds: string[];
  knowledgeArticleIds: string[];
  dealStagesRenamed: Array<{ from: string; to: string }>;
}

/**
 * Composite orchestrator, structurally mirrors applyDraftConfiguration()
 * (src/lib/company-discovery/auto-configure.ts) — calls the same per-kind
 * installers every other pack category uses, in a fixed order, additive
 * only. Deal-stage renames use the identical guard: only rename a stage
 * still exactly matching the name the manifest expects to find — a human
 * who already customized it is left alone.
 */
export async function installIndustryPack(organizationId: string, manifest: IndustryPackManifest, createdByUserId: string): Promise<IndustryPackInstallResult> {
  const result: IndustryPackInstallResult = {
    documentTemplateIds: [],
    dashboardTemplateIds: [],
    workflowIds: [],
    knowledgeArticleIds: [],
    dealStagesRenamed: [],
  };

  for (const dt of manifest.documentTemplates ?? []) {
    const { documentTemplateId } = await installDocumentTemplatePack(organizationId, { kind: "DOCUMENT_TEMPLATE", documentTemplate: dt }, createdByUserId);
    result.documentTemplateIds.push(documentTemplateId);
  }

  for (const dashboard of manifest.dashboards ?? []) {
    const { dashboardTemplateId } = await installDashboardPack(organizationId, { kind: "DASHBOARD_PACK", templateName: dashboard.templateName, widgets: dashboard.widgets }, createdByUserId);
    result.dashboardTemplateIds.push(dashboardTemplateId);
  }

  for (const automationTemplateName of manifest.automationTemplateNames ?? []) {
    const { workflowId } = await installWorkflowPack(organizationId, { kind: "WORKFLOW", automationTemplateName }, createdByUserId);
    result.workflowIds.push(workflowId);
  }

  if (manifest.knowledgeArticles?.length) {
    const { knowledgeArticleIds } = await installKnowledgePack(organizationId, { kind: "KNOWLEDGE_PACK", articles: manifest.knowledgeArticles }, createdByUserId);
    result.knowledgeArticleIds = knowledgeArticleIds;
  }

  if (manifest.dealStageRenames?.length) {
    const workspace = await prisma.workspace.findUnique({
      where: { organizationId },
      select: { dealStages: { select: { id: true, name: true } } },
    });
    if (workspace) {
      for (const rename of manifest.dealStageRenames) {
        const stage = workspace.dealStages.find((s) => s.name === rename.fromDefaultName);
        if (!stage) continue; // human already customized this stage (or it doesn't exist) — leave it alone
        await prisma.dealStage.update({ where: { id: stage.id }, data: { name: rename.toName } });
        result.dealStagesRenamed.push({ from: rename.fromDefaultName, to: rename.toName });
      }
    }
  }

  return result;
}
