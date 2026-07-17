import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { addWidget, getOrCreateDefaultDashboard, type WidgetPosition } from "@/lib/dashboard";
import { createArticle } from "@/app/dashboard/knowledge-base/actions";
import { ensureAutomationTemplatesSeeded } from "@/lib/workflows/template-catalog";
import { installTemplate } from "@/lib/workflows/templates";
import type { WidgetType } from "@/generated/prisma/client";

import { DEFAULT_DEAL_STAGE_NAMES, type DraftConfiguration } from "./draft-configuration";

/**
 * Applies an owner-approved `draftConfiguration` proposal to real, live data —
 * the ONLY code path allowed to do so (plan §6-9/§11). Every write below
 * reuses an existing, unmodified create/update function; nothing here is a
 * bespoke bulk-write. Design principles, matching the approved plan exactly:
 *  - Additive only — never removes/overwrites anything the org already has.
 *  - Owner picks exactly which proposed items to apply (approvedX arrays) —
 *    unchecked items are silently skipped, never applied "just in case".
 *  - A deal-stage rename only ever applies to a stage that STILL exactly
 *    matches its onboarding default — any stage a human already renamed is
 *    left untouched, closing the "clobbers a manual edit" risk.
 *  - Unknown/hallucinated template names are silently skipped (defense in
 *    depth — draft-configuration.ts already filters these once, this is the
 *    second, independent check right before the write that matters).
 */

export interface AutoConfigureResult {
  widgetsAdded: WidgetType[];
  templatesInstalled: string[];
  articlesCreated: string[];
  dealStagesRenamed: Array<{ order: number; from: string; to: string }>;
}

export interface ApplyDraftConfigurationParams {
  organizationId: string;
  userId: string;
  draftConfiguration: DraftConfiguration;
  approvedWidgets: WidgetType[];
  approvedTemplateNames: string[];
  approvedArticleTitles: string[];
  approveDealStageRenames: boolean;
}

export async function applyDraftConfiguration(params: ApplyDraftConfigurationParams): Promise<AutoConfigureResult> {
  const result: AutoConfigureResult = { widgetsAdded: [], templatesInstalled: [], articlesCreated: [], dealStagesRenamed: [] };

  // ---- Dashboard widgets — additive, never duplicates a type already present ----
  const dashboard = await getOrCreateDefaultDashboard(params.userId, params.organizationId);
  const existingTypes = new Set(dashboard.widgets.map((w) => w.type));
  let nextY = dashboard.widgets.reduce((max, w) => {
    const position = w.position as unknown as WidgetPosition;
    return Math.max(max, position.y + position.h);
  }, 0);

  const approvedWidgetSet = new Set(params.approvedWidgets);
  for (const type of params.draftConfiguration.dashboardWidgets) {
    if (!approvedWidgetSet.has(type)) continue;
    if (existingTypes.has(type)) continue; // already on the dashboard — never a duplicate
    await addWidget(dashboard.id, type, { x: 0, y: nextY, w: 6, h: 4 }, params.userId);
    nextY += 4;
    result.widgetsAdded.push(type);
  }

  // ---- Knowledge Base articles — always land DRAFT (createArticle's existing default) ----
  const approvedArticleTitles = new Set(params.approvedArticleTitles);
  for (const article of params.draftConfiguration.knowledgeArticles) {
    if (!approvedArticleTitles.has(article.title)) continue;
    const created = await createArticle({
      title: article.title,
      content: article.content,
      tags: [],
      tagEntityNames: [],
      kind: "ARTICLE",
      visibility: "ORG",
      categoryId: null,
    });
    if (created.ok) result.articlesCreated.push(article.title);
  }

  // ---- Automation workflows — installTemplate always lands DRAFT (existing, unmodified behavior).
  // Templates live in the AutomationTemplate DB table (seeded from the AUTOMATION_TEMPLATES
  // catalog) — same lookup path the human-triggered installTemplateAction uses, not the raw
  // catalog array, so this stays consistent with however the catalog has been seeded/edited. ----
  await ensureAutomationTemplatesSeeded();
  const approvedTemplateNames = new Set(params.approvedTemplateNames);
  for (const name of params.draftConfiguration.workflowTemplateNames) {
    if (!approvedTemplateNames.has(name)) continue;
    const template = await prisma.automationTemplate.findFirst({ where: { name } });
    if (!template) continue; // hallucinated/unknown name — never installed
    await installTemplate(template, params.organizationId, params.userId);
    result.templatesInstalled.push(name);
  }

  // ---- Deal stage renames — only where the org's stage still exactly matches its onboarding default ----
  if (params.approveDealStageRenames && params.draftConfiguration.dealStageRenames.length > 0) {
    const workspace = await prisma.workspace.findUnique({
      where: { organizationId: params.organizationId },
      select: { dealStages: { select: { id: true, order: true, name: true } } },
    });
    if (workspace) {
      for (const rename of params.draftConfiguration.dealStageRenames) {
        const stage = workspace.dealStages.find((s) => s.order === rename.order);
        const defaultName = DEFAULT_DEAL_STAGE_NAMES[rename.order];
        if (!stage || !defaultName || stage.name !== defaultName) continue; // human already customized this stage — leave it alone
        await prisma.dealStage.update({ where: { id: stage.id }, data: { name: rename.suggestedName } });
        result.dealStagesRenamed.push({ order: rename.order, from: stage.name, to: rename.suggestedName });
      }
    }
  }

  await logAudit({
    userId: params.userId,
    organizationId: params.organizationId,
    action: "company_dna.auto_config_applied",
    metadata: { ...result },
  });

  return result;
}
