import { z } from "zod";

import { generateStructured } from "@/lib/ai/fallback";
import { recordAIUsage } from "@/lib/billing/ai-credits";
import { AUTOMATION_TEMPLATES } from "@/lib/workflows/template-catalog";

import type { BusinessUnderstanding } from "./business-understanding";

/**
 * Step 10 (Draft Configuration) — the AI only DECIDES which widgets/templates
 * to propose and drafts Knowledge Base article text; it never writes a live
 * row. Constrained to real enum values / real template names so the proposal
 * can never reference something that doesn't exist — src/lib/company-
 * discovery/auto-configure.ts is the only code that turns this into real
 * data, and only after the owner approves (see plan §6-9/§11).
 */

const WIDGET_TYPES = ["REVENUE", "PIPELINE", "TASKS", "CALENDAR", "NOTES", "AI_ACTIVITY", "REPORTS", "WEATHER", "CLOCK", "UPCOMING_MEETINGS"] as const;
const TEMPLATE_NAMES = AUTOMATION_TEMPLATES.map((t) => t.name);

// The exact onboarding-default CRM deal stages (src/app/onboarding/agents-actions.ts's
// DEAL_STAGES), by order index — auto-configure.ts only ever applies a rename when the
// org's stage at that order STILL exactly matches this default, so a human's own edit is
// never clobbered.
export const DEFAULT_DEAL_STAGE_NAMES = [
  "New Lead",
  "Qualified",
  "Research",
  "Opportunity",
  "Proposal",
  "Negotiation",
  "Contract",
  "Won",
  "Lost",
  "Archived",
] as const;

const DraftConfigurationSchema = z.object({
  dashboardWidgets: z.array(z.enum(WIDGET_TYPES)).max(6).default([]),
  workflowTemplateNames: z.array(z.string()).max(4).default([]),
  knowledgeArticles: z
    .array(
      z.object({
        title: z.string(),
        content: z.string(),
      }),
    )
    .max(5)
    .default([]),
  dealStageRenames: z
    .array(
      z.object({
        order: z.number().int().min(0).max(DEFAULT_DEAL_STAGE_NAMES.length - 1),
        suggestedName: z.string(),
      }),
    )
    .max(DEFAULT_DEAL_STAGE_NAMES.length)
    .default([]),
});
export type DraftConfiguration = z.infer<typeof DraftConfigurationSchema>;

export async function proposeDraftConfiguration(params: {
  organizationId: string;
  companyName: string;
  businessUnderstanding: BusinessUnderstanding;
}): Promise<DraftConfiguration> {
  const result = await generateStructured({
    system: [
      `You are configuring a new organization's workspace based on its real business profile. Propose dashboard widgets from this exact fixed list only: ${WIDGET_TYPES.join(", ")}.`,
      `Propose automation templates by choosing zero or more names EXACTLY as written from this list only: ${TEMPLATE_NAMES.map((n) => `"${n}"`).join(", ")}. Never invent a template name not in this list.`,
      "Draft up to 5 short Knowledge Base articles (title + plain-text content, 100-300 words each) genuinely useful for this specific company — e.g. Company Overview, Our Services, FAQs — grounded only in the business profile given, never generic filler unrelated to this company.",
      `This CRM's default sales pipeline stages, by order index, are: ${DEFAULT_DEAL_STAGE_NAMES.map((n, i) => `${i}="${n}"`).join(", ")}. Only propose a rename (order + suggestedName) for a stage where this specific company's real sales process genuinely uses different terminology (e.g. a services firm might rename "Research" to "Discovery Call") — leave dealStageRenames empty if the generic defaults already fit fine; never rename just to rename.`,
      "This is a PROPOSAL ONLY — none of this gets created until the org owner reviews and approves it, so it's fine to be opinionated, but every suggestion must still be genuinely relevant to the real business profile given, not a generic default set.",
    ].join(" "),
    userContent: JSON.stringify({ companyName: params.companyName, businessUnderstanding: params.businessUnderstanding }),
    maxTokens: 4096,
    effort: "medium",
    schema: DraftConfigurationSchema,
  });

  await recordAIUsage(
    params.organizationId,
    result.provider,
    result.model,
    result.inputTokens,
    result.outputTokens,
    "company-discovery:draft-configuration",
  );

  // Belt-and-braces: even though the schema constrains widget values and the
  // prompt lists real template names, filter template names against the real
  // catalog again here so a hallucinated name can never survive into the
  // stored proposal (auto-configure.ts does the same check again before
  // installing, per defense-in-depth — never trust a single validation layer
  // for something that will later write real DB rows).
  const validTemplateNames = new Set(TEMPLATE_NAMES);
  return {
    ...result.parsed,
    workflowTemplateNames: result.parsed.workflowTemplateNames.filter((name) => validTemplateNames.has(name)),
  };
}
