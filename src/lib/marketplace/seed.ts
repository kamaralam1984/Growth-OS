import { prisma } from "@/lib/prisma";
import type { Prisma, MarketplaceCategory } from "@/generated/prisma/client";
import { ensureAutomationTemplatesSeeded } from "@/lib/workflows/template-catalog";
import type { Manifest } from "./manifest-schema";

/**
 * Idempotent, per-listing (by slug) seeding — unlike the legacy
 * ensureMarketplaceCatalog() (src/lib/marketplace.ts), which only ever runs
 * once globally (gated on `count === 0`), this upserts each Phase 19
 * listing independently so it's safe to call repeatedly as new categories
 * ship, and safe to call on a DB where the legacy 8 rows already exist.
 * Every listing seeded here is backed by a REAL installable manifest — no
 * fabricated catalog entries.
 */

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

interface SeedListingInput {
  slug: string;
  name: string;
  description: string;
  tagline?: string;
  category: string;
  icon?: string;
  manifest: Manifest;
  industryTags?: string[];
  /** Omitted = FREE (the default for every seeded listing). Set for the one real paid example listing. */
  pricing?: { model: "ONE_TIME" | "SUBSCRIPTION"; priceCents: number; currency: string };
}

async function upsertListing(input: SeedListingInput): Promise<void> {
  const existing = await prisma.marketplaceListing.findUnique({ where: { slug: input.slug } });

  const listing = await prisma.marketplaceListing.upsert({
    where: { slug: input.slug },
    create: {
      slug: input.slug,
      name: input.name,
      description: input.description,
      tagline: input.tagline,
      category: input.category as MarketplaceCategory,
      status: "PUBLISHED",
      icon: input.icon,
      manifest: input.manifest as unknown as Prisma.InputJsonValue,
      industryTags: input.industryTags ?? [],
      pricingModel: input.pricing?.model ?? "FREE",
      priceCents: input.pricing?.priceCents,
      currency: input.pricing?.currency,
    },
    update: {
      name: input.name,
      description: input.description,
      tagline: input.tagline,
      manifest: input.manifest as unknown as Prisma.InputJsonValue,
      status: "PUBLISHED",
      pricingModel: input.pricing?.model ?? "FREE",
      priceCents: input.pricing?.priceCents,
      currency: input.pricing?.currency,
    },
  });

  if (existing?.currentVersionId) return; // already versioned — don't create a duplicate v1.0.0

  const version = await prisma.marketplaceVersion.create({
    data: {
      listingId: listing.id,
      version: "1.0.0",
      manifest: input.manifest as unknown as Prisma.InputJsonValue,
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });
  await prisma.marketplaceListing.update({ where: { id: listing.id }, data: { currentVersionId: version.id } });
}

/** Renames the legacy pre-Phase-19 "Legal Agent Pack" row in place (by name) rather than creating a duplicate — it already existed as a honest COMING_SOON stub. */
async function upgradeLegacyLegalAgentPack(): Promise<void> {
  const legacy = await prisma.marketplaceListing.findFirst({ where: { name: "Legal Agent Pack", slug: null } });
  if (!legacy) return;

  const manifest: Manifest = { kind: "AGENT_PACK", agentType: "LEGAL" };
  const version = await prisma.marketplaceVersion.create({
    data: { listingId: legacy.id, version: "1.0.0", manifest: manifest as unknown as Prisma.InputJsonValue, status: "PUBLISHED", publishedAt: new Date() },
  });
  await prisma.marketplaceListing.update({
    where: { id: legacy.id },
    data: { slug: "legal-agent-pack", status: "PUBLISHED", manifest: manifest as unknown as Prisma.InputJsonValue, currentVersionId: version.id },
  });
}

export async function ensureWorkflowMarketplaceListings(): Promise<void> {
  await ensureAutomationTemplatesSeeded();
  const templates = await prisma.automationTemplate.findMany();

  for (const template of templates) {
    const manifest: Manifest = { kind: "WORKFLOW", automationTemplateName: template.name };
    await upsertListing({
      slug: slugify(template.name),
      name: template.name,
      description: template.description,
      category: "WORKFLOW",
      icon: template.icon ?? undefined,
      manifest,
      industryTags: [template.category],
    });
  }

  await upgradeLegacyLegalAgentPack();
}

export async function ensureDocumentTemplateMarketplaceListings(): Promise<void> {
  await upsertListing({
    slug: "saas-implementation-proposal",
    name: "SaaS Implementation Proposal",
    description: "A complete proposal template for SaaS implementation engagements — scope, timeline, pricing model, and terms sections, ready to fill in real client/deal details.",
    tagline: "Win more SaaS implementation deals with a proven structure",
    category: "PROPOSAL_TEMPLATE",
    manifest: {
      kind: "DOCUMENT_TEMPLATE",
      documentTemplate: {
        name: "SaaS Implementation Proposal",
        docKind: "PROPOSAL",
        category: "SAAS",
        content: `# Proposal: {{companyName}} — SaaS Implementation

## Executive Summary
This proposal outlines our approach to implementing {{productName}} for {{clientName}}, covering scope, timeline, investment, and terms.

## Scope of Work
- Discovery & requirements workshop
- Environment setup and configuration
- Data migration from existing systems
- Integration with {{clientName}}'s existing tools
- User acceptance testing
- Go-live support and training

## Timeline
| Phase | Duration |
|---|---|
| Discovery | 1 week |
| Configuration & Migration | 2-4 weeks |
| Testing & Training | 1-2 weeks |
| Go-live | 1 week |

## Investment
Pricing to be confirmed based on final scope — see attached quotation.

## Terms
Standard payment terms: 50% upfront, 50% on go-live. Full terms in the accompanying Master Service Agreement.`,
      },
    },
    industryTags: ["SAAS", "SOFTWARE_DEVELOPMENT"],
  });

  await upsertListing({
    slug: "client-onboarding-scope-of-work",
    name: "Client Onboarding Scope of Work",
    description: "A reusable Scope of Work document for kicking off a new client engagement — deliverables, responsibilities, and assumptions laid out clearly before work begins.",
    tagline: "Set clear expectations from day one",
    category: "CRM_TEMPLATE",
    manifest: {
      kind: "DOCUMENT_TEMPLATE",
      documentTemplate: {
        name: "Client Onboarding Scope of Work",
        docKind: "BUSINESS_DOCUMENT",
        businessDocKind: "SCOPE_OF_WORK",
        category: "CONSULTING",
        content: `# Scope of Work — {{clientName}} Onboarding

## Deliverables
1. Kickoff call and stakeholder alignment
2. Account/workspace configuration
3. Data import and validation
4. Initial training session for {{clientName}}'s team
5. 30-day check-in

## Client Responsibilities
- Provide access to relevant systems/data within 3 business days of kickoff
- Assign a primary point of contact
- Attend scheduled training sessions

## Assumptions
- Standard configuration unless otherwise agreed in writing
- Timeline assumes timely client responses to information requests`,
      },
    },
    industryTags: ["CRM", "CONSULTING"],
  });
}

const DASHBOARD_LAYOUT_2x2 = [
  { x: 0, y: 0, w: 6, h: 4 },
  { x: 6, y: 0, w: 6, h: 4 },
  { x: 0, y: 4, w: 6, h: 4 },
  { x: 6, y: 4, w: 6, h: 4 },
];

export async function ensureDashboardMarketplaceListings(): Promise<void> {
  await upsertListing({
    slug: "sales-pipeline-dashboard",
    name: "Sales Pipeline Dashboard",
    description: "A focused widget layout for sales teams — real pipeline value, open tasks, AI agent activity, and upcoming meetings, all in one view.",
    tagline: "Everything a sales lead checks first thing every morning",
    category: "DASHBOARD_PACK",
    manifest: {
      kind: "DASHBOARD_PACK",
      templateName: "Sales Pipeline Dashboard",
      widgets: [
        { type: "PIPELINE", position: DASHBOARD_LAYOUT_2x2[0] },
        { type: "TASKS", position: DASHBOARD_LAYOUT_2x2[1] },
        { type: "AI_ACTIVITY", position: DASHBOARD_LAYOUT_2x2[2] },
        { type: "UPCOMING_MEETINGS", position: DASHBOARD_LAYOUT_2x2[3] },
      ],
    },
    industryTags: ["SALES"],
  });

  await upsertListing({
    slug: "executive-analytics-pack",
    name: "Executive Analytics Pack",
    description: "A leadership-focused layout — real revenue, reports, and AI activity widgets, sized for a quick daily scan rather than deep-diving.",
    tagline: "The numbers leadership actually checks daily",
    category: "ANALYTICS_PACK",
    manifest: {
      kind: "DASHBOARD_PACK",
      templateName: "Executive Analytics Pack",
      widgets: [
        { type: "REVENUE", position: DASHBOARD_LAYOUT_2x2[0] },
        { type: "REPORTS", position: DASHBOARD_LAYOUT_2x2[1] },
        { type: "AI_ACTIVITY", position: DASHBOARD_LAYOUT_2x2[2] },
        { type: "PIPELINE", position: DASHBOARD_LAYOUT_2x2[3] },
      ],
    },
    industryTags: ["EXECUTIVE"],
  });
}

export async function ensureIndustryPackMarketplaceListings(): Promise<void> {
  await ensureAutomationTemplatesSeeded();

  await upsertListing({
    slug: "software-agency-growth-pack",
    name: "Software Agency Growth Pack",
    description: "A complete starter setup for a software development agency — a proposal template, a sales pipeline dashboard, the Lead Follow-up and Client Onboarding workflows, and renamed deal stages that match how agencies actually sell.",
    tagline: "Everything a software agency needs configured on day one",
    category: "INDUSTRY_PACK",
    manifest: {
      kind: "INDUSTRY_PACK",
      documentTemplates: [
        {
          name: "Software Development Proposal",
          docKind: "PROPOSAL",
          category: "SOFTWARE_DEVELOPMENT",
          content: `# Proposal: {{companyName}} — Software Development\n\n## Scope\nCustom software development engagement for {{clientName}}, covering architecture, development, QA, and deployment.\n\n## Timeline & Investment\nTo be confirmed based on final scope — see attached quotation.`,
        },
      ],
      dashboards: [
        {
          templateName: "Agency Delivery Dashboard",
          widgets: [
            { type: "PIPELINE", position: DASHBOARD_LAYOUT_2x2[0] },
            { type: "TASKS", position: DASHBOARD_LAYOUT_2x2[1] },
            { type: "REVENUE", position: DASHBOARD_LAYOUT_2x2[2] },
            { type: "AI_ACTIVITY", position: DASHBOARD_LAYOUT_2x2[3] },
          ],
        },
      ],
      automationTemplateNames: ["Lead Follow-up", "Client Onboarding"],
      dealStageRenames: [
        { fromDefaultName: "New", toName: "Discovery" },
        { fromDefaultName: "Qualified", toName: "Scoping" },
      ],
    },
    industryTags: ["SOFTWARE_DEVELOPMENT", "SAAS"],
    // The one real paid example listing — proves the ONE_TIME checkout →
    // real PlatformInvoice/PlatformPayment → install → License →
    // Commission pipeline end-to-end, through the always-available Manual
    // gateway when no card gateway is configured, exactly like every other
    // "real money, zero platform config required" flow in this app.
    pricing: { model: "ONE_TIME", priceCents: 4900, currency: "USD" },
  });

  await upsertListing({
    slug: "real-estate-agency-pack",
    name: "Real Estate Agency Pack",
    description: "A starter setup for a real estate agency's CRM — a client-facing scope-of-work template, a pipeline dashboard, and the Lead Follow-up workflow tuned for listing/showing follow-ups.",
    tagline: "Configure a real estate CRM in one click",
    category: "INDUSTRY_PACK",
    manifest: {
      kind: "INDUSTRY_PACK",
      documentTemplates: [
        {
          name: "Property Listing Scope of Work",
          docKind: "BUSINESS_DOCUMENT",
          businessDocKind: "SCOPE_OF_WORK",
          category: "CONSULTING",
          content: `# Listing Agreement Scope — {{clientName}}\n\n## Services\n- Property listing and marketing\n- Showing coordination\n- Offer negotiation support\n\n## Timeline\nListing goes live within 3 business days of signed agreement.`,
        },
      ],
      dashboards: [
        {
          templateName: "Real Estate Pipeline Dashboard",
          widgets: [
            { type: "PIPELINE", position: DASHBOARD_LAYOUT_2x2[0] },
            { type: "CALENDAR", position: DASHBOARD_LAYOUT_2x2[1] },
            { type: "TASKS", position: DASHBOARD_LAYOUT_2x2[2] },
            { type: "UPCOMING_MEETINGS", position: DASHBOARD_LAYOUT_2x2[3] },
          ],
        },
      ],
      automationTemplateNames: ["Lead Follow-up"],
    },
    industryTags: ["REAL_ESTATE"],
  });
}

const INTEGRATION_PROVIDER_GROUPS: Record<string, string[]> = {
  Email: ["GOOGLE_GMAIL", "MICROSOFT_OUTLOOK", "SENDGRID", "MAILGUN", "AMAZON_SES"],
  Calendar: ["GOOGLE_CALENDAR", "MICROSOFT_CALENDAR", "CAL_COM", "CALENDLY"],
  "e-Signature": ["DOCUSIGN", "ADOBE_SIGN", "DROPBOX_SIGN"],
  "External CRM Sync": ["HUBSPOT", "SALESFORCE", "ZOHO_CRM", "PIPEDRIVE", "FRESHSALES"],
  Communication: ["SLACK", "MICROSOFT_TEAMS", "DISCORD", "TELEGRAM", "TWILIO"],
  Storage: ["GOOGLE_DRIVE", "DROPBOX", "ONEDRIVE", "AWS_S3", "CLOUDFLARE_R2"],
  Payments: ["STRIPE", "RAZORPAY", "PAYPAL", "PADDLE", "LEMONSQUEEZY"],
  Accounting: ["QUICKBOOKS", "XERO", "ZOHO_BOOKS"],
  Meetings: ["ZOOM", "GOOGLE_MEET"],
  Development: ["GITHUB", "GITLAB", "BITBUCKET", "VERCEL", "NETLIFY", "CLOUDFLARE"],
  "AI Provider": ["OPENAI", "GOOGLE_GEMINI", "DEEPSEEK", "GROQ", "OPENROUTER", "OLLAMA"],
  "Embedding Provider": ["VOYAGE_AI", "COHERE", "JINA_EMBEDDINGS", "BGE"],
};

// Bespoke copy for the connectors the Phase 19 brief names explicitly;
// every other provider in IntegrationProviderKey still gets a real listing
// with an honest, auto-generated description below — never skipped, never
// fabricated functionality (every one deep-links to the actual, working
// Integration Hub connect flow).
const CURATED_INTEGRATION_COPY: Record<string, { displayName: string; description: string; tagline: string }> = {
  SLACK: { displayName: "Slack", description: "Mirror every in-app notification to a Slack channel via an incoming webhook, and connect Slack as a real integration for future two-way actions.", tagline: "Real-time notifications where your team already is" },
  HUBSPOT: { displayName: "HubSpot", description: "Sync companies, contacts, and deals with your HubSpot CRM.", tagline: "Keep HubSpot and GrowthOS in sync" },
  SALESFORCE: { displayName: "Salesforce", description: "Sync companies, contacts, and deals with your Salesforce org.", tagline: "Enterprise CRM sync" },
  ZOHO_CRM: { displayName: "Zoho CRM", description: "Sync companies, contacts, and deals with Zoho CRM.", tagline: "Zoho CRM sync" },
  QUICKBOOKS: { displayName: "QuickBooks", description: "Sync invoices and payments with QuickBooks Online for real bookkeeping continuity.", tagline: "Real accounting sync, not a spreadsheet export" },
  STRIPE: { displayName: "Stripe", description: "Real payment processing for Billing — plans, invoices, and card management.", tagline: "Accept real payments" },
  RAZORPAY: { displayName: "Razorpay", description: "Real payment processing for Billing, tuned for India-based billing flows.", tagline: "Accept real payments in India" },
  XERO: { displayName: "Xero", description: "Sync invoices and payments with Xero for real bookkeeping continuity.", tagline: "Real accounting sync" },
  GITHUB: { displayName: "GitHub", description: "Connect a GitHub account/org for real repository and deployment context inside GrowthOS.", tagline: "Ship with real repo context" },
  GITLAB: { displayName: "GitLab", description: "Connect a GitLab account/group for real repository and deployment context inside GrowthOS.", tagline: "Ship with real repo context" },
  GOOGLE_DRIVE: { displayName: "Google Drive", description: "Store and retrieve real files in your organization's Google Drive from inside GrowthOS.", tagline: "Real file storage where your team already works" },
  MICROSOFT_OUTLOOK: { displayName: "Microsoft 365 (Outlook)", description: "Send proposals and outreach drafts directly from your connected Microsoft 365 inbox, with reply tracking.", tagline: "Microsoft 365 email, connected" },
  CALENDLY: { displayName: "Calendly", description: "Two-way sync between AI Executive Board meetings and your real Calendly scheduling links.", tagline: "Real scheduling sync" },
  ZOOM: { displayName: "Zoom", description: "Attach real Zoom meeting links to AI Executive Board meetings and client calls automatically.", tagline: "Real video meeting links, automatically" },
  TWILIO: { displayName: "Twilio (SMS & WhatsApp)", description: "Send real SMS and WhatsApp Business messages via your connected Twilio account — the same real credential this app's automation SMS/WhatsApp nodes use.", tagline: "Real SMS and WhatsApp messaging" },
  TELEGRAM: { displayName: "Telegram", description: "Send real notifications and messages to a connected Telegram chat or channel via bot token.", tagline: "Real Telegram notifications" },
  DROPBOX: { displayName: "Dropbox", description: "Store and retrieve real files in your organization's Dropbox from inside GrowthOS.", tagline: "Real file storage" },
  DOCUSIGN: { displayName: "DocuSign", description: "Send documents for real e-signature via your connected DocuSign account.", tagline: "Real e-signature" },
};

function toDisplayName(providerKey: string): string {
  return providerKey
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Seeds a real MarketplaceListing (kind INTEGRATION_CONNECTOR) for every
 * value in IntegrationProviderKey — the "surface existing data as
 * listings" category. No IntegrationConnection row is ever fabricated;
 * every listing's manifest just deep-links to the real, already-working
 * Integration Hub connect flow (installIntegrationConnector()).
 */
export async function ensureIntegrationConnectorMarketplaceListings(): Promise<void> {
  for (const [group, providers] of Object.entries(INTEGRATION_PROVIDER_GROUPS)) {
    for (const provider of providers) {
      const curated = CURATED_INTEGRATION_COPY[provider];
      const displayName = curated?.displayName ?? toDisplayName(provider);
      await upsertListing({
        slug: slugify(`connector-${provider}`),
        name: displayName,
        description: curated?.description ?? `Connect your ${displayName} account to use it as a real ${group} integration inside GrowthOS.`,
        tagline: curated?.tagline ?? `${group} integration`,
        category: "INTEGRATION_CONNECTOR",
        manifest: { kind: "INTEGRATION_CONNECTOR", provider },
        industryTags: [group],
      });
    }
  }

  // Upgrade the 2 legacy AVAILABLE integration rows (Slack/Teams) in place
  // with real manifests, rather than leaving duplicates alongside the new
  // slugged rows above.
  const legacySlack = await prisma.marketplaceListing.findFirst({ where: { name: "Slack Notifications", slug: null } });
  if (legacySlack) {
    const manifest: Manifest = { kind: "INTEGRATION_CONNECTOR", provider: "SLACK" };
    const version = await prisma.marketplaceVersion.create({
      data: { listingId: legacySlack.id, version: "1.0.0", manifest: manifest as unknown as Prisma.InputJsonValue, status: "PUBLISHED", publishedAt: new Date() },
    });
    await prisma.marketplaceListing.update({
      where: { id: legacySlack.id },
      data: { slug: "slack-notifications-legacy", manifest: manifest as unknown as Prisma.InputJsonValue, currentVersionId: version.id },
    });
  }
  const legacyTeams = await prisma.marketplaceListing.findFirst({ where: { name: "Microsoft Teams Notifications", slug: null } });
  if (legacyTeams) {
    const manifest: Manifest = { kind: "INTEGRATION_CONNECTOR", provider: "MICROSOFT_TEAMS" };
    const version = await prisma.marketplaceVersion.create({
      data: { listingId: legacyTeams.id, version: "1.0.0", manifest: manifest as unknown as Prisma.InputJsonValue, status: "PUBLISHED", publishedAt: new Date() },
    });
    await prisma.marketplaceListing.update({
      where: { id: legacyTeams.id },
      data: { slug: "teams-notifications-legacy", manifest: manifest as unknown as Prisma.InputJsonValue, currentVersionId: version.id },
    });
  }
}

export async function ensureWhiteLabelMarketplaceListings(): Promise<void> {
  await upsertListing({
    slug: "agency-white-label-pack",
    name: "Agency White Label Pack",
    description: "A real template-override bundle for agencies reselling GrowthOS under their own brand — pre-tuned client-facing document header/footer overrides. Merges into your existing White Label settings without touching your logo/color customizations.",
    tagline: "Client-facing polish for agencies",
    category: "WHITE_LABEL_PACK",
    manifest: {
      kind: "WHITE_LABEL_PACK",
      templateOverrides: {
        proposalFooterNote: "Prepared exclusively for you — questions welcome any time.",
        invoiceFooterNote: "Thank you for your business.",
      },
    },
    industryTags: ["AGENCY"],
  });
}

export async function ensureKnowledgeAndPromptMarketplaceListings(): Promise<void> {
  await upsertListing({
    slug: "sales-knowledge-pack",
    name: "Sales Knowledge Pack",
    description: "Real, ready-to-publish Knowledge Base articles covering objection handling, discovery calls, and proposal follow-up cadence — lands as DRAFT for your team to review before publishing.",
    tagline: "Give every sales rep the same real playbook",
    category: "KNOWLEDGE_PACK",
    manifest: {
      kind: "KNOWLEDGE_PACK",
      articles: [
        {
          title: "Handling the \"it's too expensive\" objection",
          content: "When a prospect says pricing is too high, don't discount immediately. First, reconfirm the value they described in discovery — what problem is this solving, and what does that problem cost them today? Then offer a scoped-down starting point if budget is genuinely the blocker, rather than cutting price on the full scope.",
          tags: ["sales", "objection-handling"],
        },
        {
          title: "Discovery call structure",
          content: "1) Confirm the business problem in their words. 2) Ask what they've already tried. 3) Quantify impact (time, money, risk). 4) Confirm decision process and timeline. 5) Set a clear next step before ending the call — never leave without a scheduled follow-up.",
          tags: ["sales", "discovery"],
        },
        {
          title: "Proposal follow-up cadence",
          content: "Day 2: check they received it and ask if anything's unclear. Day 5: share one relevant case study or answer a likely question proactively. Day 10: a direct check-in on decision timeline. After day 10 with no response, mark it dormant rather than continuing to chase indefinitely.",
          tags: ["sales", "proposals"],
        },
      ],
    },
    industryTags: ["SALES"],
  });

  await upsertListing({
    slug: "sales-prompt-pack",
    name: "Sales Prompt Pack",
    description: "Real, reusable AI prompts for cold outreach, discovery follow-ups, and objection-handling emails — install them straight into your Prompt Library.",
    tagline: "Real prompts for every stage of a sales conversation",
    category: "PROMPT_PACK",
    manifest: {
      kind: "PROMPT_PACK",
      prompts: [
        {
          title: "Cold outreach opener",
          promptText: "Write a short, specific cold outreach email to {{contactName}} at {{companyName}}. Reference a real, specific reason this company would care about {{ourService}} — never a generic \"I noticed you're in the {{industry}} space\" line. Keep it under 100 words and end with a low-commitment ask.",
          variables: ["contactName", "companyName", "ourService", "industry"],
          category: "Sales",
        },
        {
          title: "Discovery call follow-up",
          promptText: "Write a follow-up email to {{contactName}} after our discovery call. Summarize the specific problem they described ({{problemSummary}}) and confirm the next step we agreed on ({{nextStep}}). Keep it factual — don't add anything we didn't actually discuss.",
          variables: ["contactName", "problemSummary", "nextStep"],
          category: "Sales",
        },
        {
          title: "Price objection response",
          promptText: "{{contactName}} said our pricing is too high. Write a response that reconfirms the value of solving {{problemSummary}} before discussing price, and offers {{alternativeOption}} as a scoped-down starting point if that's genuinely the blocker.",
          variables: ["contactName", "problemSummary", "alternativeOption"],
          category: "Sales",
        },
      ],
    },
    industryTags: ["SALES"],
  });
}

interface AgentSeedInput {
  agentType: "HR" | "SUPPORT" | "RECRUITMENT" | "SEO" | "BUSINESS_ANALYST" | "RESEARCH" | "CUSTOMER_SUCCESS";
  slug: string;
  name: string;
  description: string;
  tagline: string;
  icon: string;
}

const AGENT_SEEDS: AgentSeedInput[] = [
  {
    agentType: "HR",
    slug: "hr-agent",
    name: "HR Agent",
    description: "A real AI executive agent for people operations — hiring pipeline, candidate screening, interview scheduling, employee onboarding, and leave management, all backed by real Job Opening/Candidate/Interview/Leave Request records.",
    tagline: "Run real hiring and people ops from one agent",
    icon: "users",
  },
  {
    agentType: "SUPPORT",
    slug: "support-agent",
    name: "Support Agent",
    description: "A real AI executive agent for customer support — ticket management, FAQ responses grounded in your real Knowledge Base, SLA monitoring, issue routing, and escalation handling, built on the same Task system your team already uses.",
    tagline: "Real ticketing with SLA-aware escalation",
    icon: "life-buoy",
  },
  {
    agentType: "RECRUITMENT",
    slug: "recruitment-agent",
    name: "Recruitment Agent",
    description: "A real AI executive agent for the top of your hiring funnel — job description generation, candidate sourcing, resume analysis with a deterministic skill-match score, and interview recommendations, feeding the same real pipeline the HR Agent manages downstream.",
    tagline: "Source and match candidates against real job openings",
    icon: "user-search",
  },
  {
    agentType: "SEO",
    slug: "seo-agent",
    name: "SEO Agent",
    description: "A real AI executive agent layered over the existing Website Scanner — narrates and prioritizes real SEO audit findings (meta tags, headings, canonical/schema presence, broken links) plus live-web-search keyword research, never a synthetic audit.",
    tagline: "Real SEO audits and live keyword research",
    icon: "search-check",
  },
  {
    agentType: "BUSINESS_ANALYST",
    slug: "business-analyst-agent",
    name: "Business Analyst Agent",
    description: "A real AI executive agent layered over the AI Business Growth Engine — narrates and prioritizes your real Growth Score, revenue forecast, pipeline health, and recent insights into one executive-voice improvement plan, grounded strictly in real axis data.",
    tagline: "Turn your real Growth Score into a prioritized plan",
    icon: "pie-chart",
  },
  {
    agentType: "RESEARCH",
    slug: "research-agent",
    name: "Research Agent",
    description: "A real AI executive agent for on-demand company and market research — live web search for a specific company or topic you name, producing sourced findings and opportunities, always honestly labeled as AI web search rather than verified fact.",
    tagline: "Ad-hoc, sourced research on any company or topic",
    icon: "microscope",
  },
  {
    agentType: "CUSTOMER_SUCCESS",
    slug: "customer-success-agent",
    name: "Customer Success Agent",
    description: "A real AI executive agent layered over Client Health, Churn Risk, and Upsell/Referral intelligence — generates a real portfolio digest of at-risk clients and suggested opportunities, grounded strictly in already-computed client data.",
    tagline: "A real client-portfolio health digest on demand",
    icon: "heart-handshake",
  },
];

/** Seeds one real AGENT_PACK listing per Phase 19 marketplace-installable agent type — installing runs the existing agent-pack.ts installer verbatim (AIAgentInstance upsert). */
export async function ensureAgentMarketplaceListings(): Promise<void> {
  for (const seed of AGENT_SEEDS) {
    await upsertListing({
      slug: seed.slug,
      name: seed.name,
      description: seed.description,
      tagline: seed.tagline,
      category: "AGENT_PACK",
      icon: seed.icon,
      manifest: { kind: "AGENT_PACK", agentType: seed.agentType },
    });
  }
}

// Real count of slugged rows this file seeds as of Phase 19's last update —
// used as a cheap short-circuit so a page load doesn't re-run ~150 upserts
// every time once the catalog is already seeded. Bump this if a future
// change adds more real seed listings, so the new ones actually get created
// on an existing DB rather than being silently skipped forever.
const EXPECTED_MIN_SEEDED_LISTINGS = 85;

/**
 * Single entry point for every Phase 19 seed function — call this from the
 * marketplace page instead of the individual functions above. Cheap
 * short-circuit: skips the whole batch once the catalog already has at
 * least the expected number of real slugged listings.
 */
export async function ensureAllPhase19MarketplaceListings(): Promise<void> {
  const seededCount = await prisma.marketplaceListing.count({ where: { slug: { not: null } } });
  if (seededCount >= EXPECTED_MIN_SEEDED_LISTINGS) return;

  await ensureWorkflowMarketplaceListings();
  await ensureDocumentTemplateMarketplaceListings();
  await ensureDashboardMarketplaceListings();
  await ensureIndustryPackMarketplaceListings();
  await ensureKnowledgeAndPromptMarketplaceListings();
  await ensureIntegrationConnectorMarketplaceListings();
  await ensureWhiteLabelMarketplaceListings();
  await ensureAgentMarketplaceListings();
}
