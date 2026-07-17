import { prisma } from "@/lib/prisma";

/**
 * Feature flag resolution — three-tier precedence, checked in this exact
 * order and stopping at the first real answer found:
 *   1. OrganizationFeatureOverride (an operator explicitly flipped this
 *      feature on/off for this one org — a beta tester, a support
 *      workaround) — always wins when present.
 *   2. The org's current Plan's PlanFeature (does this org's real,
 *      currently-active plan include this feature at all).
 *   3. FeatureFlag.defaultEnabled (the flag's own global default, when no
 *      plan-specific entry exists for it either).
 * A feature key with no FeatureFlag row at all resolves to `false` — an
 * unregistered key is never silently treated as enabled.
 */
export async function isFeatureEnabled(organizationId: string, key: string): Promise<boolean> {
  const [override, billingAccount, flag] = await Promise.all([
    prisma.organizationFeatureOverride.findFirst({ where: { organizationId, featureFlag: { key } } }),
    prisma.billingAccount.findUnique({
      where: { organizationId },
      include: { currentPlan: { include: { features: { where: { key } } } } },
    }),
    prisma.featureFlag.findUnique({ where: { key } }),
  ]);

  if (override) return override.enabled;

  const planFeature = billingAccount?.currentPlan?.features[0];
  if (planFeature) return planFeature.enabled;

  return flag?.defaultEnabled ?? false;
}

/** Batch form — resolves every registered FeatureFlag for an organization in one call, for a settings/admin page rendering the full flag list rather than N sequential isFeatureEnabled() calls. */
export async function listOrganizationFeatures(organizationId: string): Promise<Array<{ key: string; name: string; description: string | null; enabled: boolean; source: "override" | "plan" | "default" }>> {
  const [flags, overrides, billingAccount] = await Promise.all([
    prisma.featureFlag.findMany({ orderBy: { key: "asc" } }),
    prisma.organizationFeatureOverride.findMany({ where: { organizationId } }),
    prisma.billingAccount.findUnique({ where: { organizationId }, include: { currentPlan: { include: { features: true } } } }),
  ]);

  const overrideByFlagId = new Map(overrides.map((o) => [o.featureFlagId, o]));
  const planFeatureByKey = new Map((billingAccount?.currentPlan?.features ?? []).map((f) => [f.key, f]));

  return flags.map((flag) => {
    const override = overrideByFlagId.get(flag.id);
    if (override) return { key: flag.key, name: flag.name, description: flag.description, enabled: override.enabled, source: "override" as const };

    const planFeature = planFeatureByKey.get(flag.key);
    if (planFeature) return { key: flag.key, name: flag.name, description: flag.description, enabled: planFeature.enabled, source: "plan" as const };

    return { key: flag.key, name: flag.name, description: flag.description, enabled: flag.defaultEnabled, source: "default" as const };
  });
}

/**
 * Real, registered feature keys this app's plans/overrides can gate —
 * matches the spec's Feature Flags list (AI Features, CRM, Projects,
 * Proposal Generator, Analytics, Automation, Integrations, Knowledge Base,
 * Client Portal, API Access). Seeded idempotently (upsert by key) rather
 * than a one-off script, so a fresh environment always has the full real
 * set without a separate seed step to remember.
 */
export const CORE_FEATURE_FLAGS: Array<{ key: string; name: string; description: string; defaultEnabled: boolean }> = [
  { key: "ai_features", name: "AI Features", description: "AI Executive Board, AI Command Center, and every AI-generated action across the app.", defaultEnabled: true },
  { key: "crm", name: "CRM", description: "Deals, contacts, pipeline management.", defaultEnabled: true },
  { key: "projects", name: "Projects", description: "Project management, milestones, sprints.", defaultEnabled: true },
  { key: "proposal_generator", name: "Proposal Generator", description: "AI-drafted proposals, quotations, contracts, invoices.", defaultEnabled: true },
  { key: "analytics", name: "Analytics", description: "Revenue forecasting and business intelligence dashboards.", defaultEnabled: true },
  { key: "automation", name: "Automation", description: "Workflow Automation Engine and the Automation Marketplace.", defaultEnabled: true },
  { key: "integrations", name: "Integrations", description: "The Integration Hub — connecting third-party accounts.", defaultEnabled: true },
  { key: "knowledge_base", name: "Knowledge Base", description: "Company Wiki, RAG document ingestion, Enterprise Search.", defaultEnabled: true },
  { key: "client_portal", name: "Client Portal", description: "The client-facing portal for projects/invoices/proposals.", defaultEnabled: true },
  { key: "api_access", name: "API Access", description: "Programmatic API keys and public API endpoints.", defaultEnabled: true },
  { key: "white_label", name: "White Label", description: "Custom branding, custom domains, white-labeled emails/PDFs.", defaultEnabled: false },
  { key: "sso", name: "Single Sign-On", description: "SSO login for organization members.", defaultEnabled: false },
  { key: "marketplace", name: "Marketplace", description: "Browse and install AI Agents, Workflows, Industry Packs, and other Marketplace listings.", defaultEnabled: true },
];

export async function ensureCoreFeatureFlagsSeeded(): Promise<void> {
  for (const flag of CORE_FEATURE_FLAGS) {
    await prisma.featureFlag.upsert({
      where: { key: flag.key },
      create: flag,
      update: { name: flag.name, description: flag.description },
    });
  }
}
