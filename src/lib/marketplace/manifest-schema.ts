import { z } from "zod";

/**
 * Per-MarketplaceCategory manifest shape — the single source of truth every
 * installer imports its sub-type from (never redeclared locally). Validated
 * at publisher-submit time AND re-validated at install time (defense in
 * depth, same discipline as installTemplate()'s own re-validation of a
 * stored AutomationTemplate.stepsBlueprint).
 *
 * Legacy categories (INTEGRATION, TEMPLATE, AGENT_PACK) predate Phase 19 and
 * may have a null manifest (the original 8 seed rows) — those listings are
 * honestly not installable through the engine until a real manifest is
 * added. AGENT_PACK's manifest shape is identical to AI agent installs
 * (there is no separate "AI_AGENT" category — AGENT_PACK already existed).
 */

const AgentTypeSchema = z.enum([
  "CEO",
  "SALES",
  "MARKETING",
  "PROPOSAL",
  "OUTREACH",
  "CRM",
  "ANALYTICS",
  "FINANCE",
  "LEGAL",
  "PROJECT_MANAGER",
  "QA_DIRECTOR",
  "DEVOPS_DIRECTOR",
  "DELIVERY_DIRECTOR",
  "HR",
  "SUPPORT",
  "RECRUITMENT",
  "SEO",
  "BUSINESS_ANALYST",
  "RESEARCH",
  "CUSTOMER_SUCCESS",
]);

const AgentPackManifestSchema = z.object({
  kind: z.literal("AGENT_PACK"),
  agentType: AgentTypeSchema,
});

const WorkflowManifestSchema = z.object({
  kind: z.literal("WORKFLOW"),
  automationTemplateName: z.string().trim().min(1),
});

const DocumentTemplateManifestSchema = z.object({
  kind: z.literal("DOCUMENT_TEMPLATE"),
  documentTemplate: z.object({
    name: z.string().trim().min(1),
    docKind: z.string(), // validated against the real DocumentKind enum by the installer via Prisma
    category: z.string().nullable().optional(),
    businessDocKind: z.string().nullable().optional(),
    contractType: z.string().nullable().optional(),
    content: z.string().trim().min(1),
  }),
});

const WidgetManifestSchema = z.object({
  type: z.string(), // validated against the real WidgetType enum by the installer via Prisma
  position: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
});

const DashboardPackManifestSchema = z.object({
  kind: z.literal("DASHBOARD_PACK"),
  templateName: z.string().trim().min(1),
  widgets: z.array(WidgetManifestSchema).min(1),
});

const KnowledgeArticleManifestSchema = z.object({
  title: z.string().trim().min(1),
  content: z.string().trim().min(1),
  tags: z.array(z.string()).default([]),
});

const KnowledgePackManifestSchema = z.object({
  kind: z.literal("KNOWLEDGE_PACK"),
  articles: z.array(KnowledgeArticleManifestSchema).min(1),
});

const PromptManifestSchema = z.object({
  title: z.string().trim().min(1),
  promptText: z.string().trim().min(1),
  variables: z.array(z.string()).default([]),
  category: z.string().nullable().optional(),
  agentType: AgentTypeSchema.nullable().optional(),
});

const PromptPackManifestSchema = z.object({
  kind: z.literal("PROMPT_PACK"),
  prompts: z.array(PromptManifestSchema).min(1),
});

const IntegrationConnectorManifestSchema = z.object({
  kind: z.literal("INTEGRATION_CONNECTOR"),
  provider: z.string(), // validated against the real IntegrationProviderKey enum by the installer via Prisma
});

const WhiteLabelPackManifestSchema = z.object({
  kind: z.literal("WHITE_LABEL_PACK"),
  templateOverrides: z.record(z.string(), z.unknown()),
});

// An Industry Pack is a composite of several of the above, each sub-array
// optional — installIndustryPack() calls only the installers whose
// sub-array is present, in a fixed, documented order.
const IndustryPackManifestSchema = z.object({
  kind: z.literal("INDUSTRY_PACK"),
  documentTemplates: z.array(DocumentTemplateManifestSchema.shape.documentTemplate).optional(),
  dashboards: z.array(z.object({ templateName: z.string().trim().min(1), widgets: z.array(WidgetManifestSchema).min(1) })).optional(),
  automationTemplateNames: z.array(z.string().trim().min(1)).optional(),
  knowledgeArticles: z.array(KnowledgeArticleManifestSchema).optional(),
  dealStageRenames: z.array(z.object({ fromDefaultName: z.string(), toName: z.string() })).optional(),
});

export const ManifestSchema = z.discriminatedUnion("kind", [
  AgentPackManifestSchema,
  WorkflowManifestSchema,
  DocumentTemplateManifestSchema,
  DashboardPackManifestSchema,
  KnowledgePackManifestSchema,
  PromptPackManifestSchema,
  IntegrationConnectorManifestSchema,
  WhiteLabelPackManifestSchema,
  IndustryPackManifestSchema,
]);

export type Manifest = z.infer<typeof ManifestSchema>;
export type AgentPackManifest = z.infer<typeof AgentPackManifestSchema>;
export type WorkflowManifest = z.infer<typeof WorkflowManifestSchema>;
export type DocumentTemplateManifest = z.infer<typeof DocumentTemplateManifestSchema>;
export type DashboardPackManifest = z.infer<typeof DashboardPackManifestSchema>;
export type KnowledgePackManifest = z.infer<typeof KnowledgePackManifestSchema>;
export type PromptPackManifest = z.infer<typeof PromptPackManifestSchema>;
export type IntegrationConnectorManifest = z.infer<typeof IntegrationConnectorManifestSchema>;
export type WhiteLabelPackManifest = z.infer<typeof WhiteLabelPackManifestSchema>;
export type IndustryPackManifest = z.infer<typeof IndustryPackManifestSchema>;

/**
 * Which listing categories are allowed to carry which manifest `kind` — a
 * WORKFLOW-category listing must have a WORKFLOW manifest, never a
 * DASHBOARD_PACK one smuggled in. AUTOMATION_TEMPLATE shares WORKFLOW's
 * manifest kind (both install into the identical Workflow+WorkflowStep
 * models via installTemplate() — the category split is a catalog/filtering
 * distinction only). CRM_TEMPLATE and PROPOSAL_TEMPLATE both share
 * DOCUMENT_TEMPLATE for the same reason. ANALYTICS_PACK shares
 * DASHBOARD_PACK's manifest kind.
 */
export const CATEGORY_TO_MANIFEST_KIND: Record<string, Manifest["kind"] | null> = {
  INTEGRATION: "INTEGRATION_CONNECTOR",
  TEMPLATE: null, // legacy, ambiguous — a real listing must be re-categorized before it can be installable
  AGENT_PACK: "AGENT_PACK",
  WORKFLOW: "WORKFLOW",
  CRM_TEMPLATE: "DOCUMENT_TEMPLATE",
  PROPOSAL_TEMPLATE: "DOCUMENT_TEMPLATE",
  AUTOMATION_TEMPLATE: "WORKFLOW",
  INDUSTRY_PACK: "INDUSTRY_PACK",
  DASHBOARD_PACK: "DASHBOARD_PACK",
  ANALYTICS_PACK: "DASHBOARD_PACK",
  INTEGRATION_CONNECTOR: "INTEGRATION_CONNECTOR",
  WHITE_LABEL_PACK: "WHITE_LABEL_PACK",
  PROMPT_PACK: "PROMPT_PACK",
  KNOWLEDGE_PACK: "KNOWLEDGE_PACK",
};

export class InvalidManifestError extends Error {}

/** Validates a raw manifest against the shape its listing's category requires. Throws InvalidManifestError, never silently coerces. */
export function validateManifest(category: string, rawManifest: unknown): Manifest {
  const expectedKind = CATEGORY_TO_MANIFEST_KIND[category];
  if (!expectedKind) {
    throw new InvalidManifestError(`Category "${category}" has no installable manifest shape yet.`);
  }
  const result = ManifestSchema.safeParse(rawManifest);
  if (!result.success) {
    throw new InvalidManifestError(`Manifest is invalid: ${result.error.issues[0]?.message ?? "unknown validation error"}.`);
  }
  if (result.data.kind !== expectedKind) {
    throw new InvalidManifestError(`Category "${category}" requires a "${expectedKind}" manifest, got "${result.data.kind}".`);
  }
  return result.data;
}
