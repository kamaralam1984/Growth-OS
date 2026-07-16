"use server";

import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { AgentType, Prisma } from "@/generated/prisma/client";

const organizationIdSchema = z.string().trim().min(1, "An organization is required.");

export interface AgentIntro {
  type: AgentType;
  name: string;
  introMessage: string;
}

/**
 * Source of truth for the 7 default agents created for every organization.
 * Order here is also the display order on the onboarding reveal screen.
 */
const AGENT_DEFINITIONS: AgentIntro[] = [
  {
    type: AgentType.CEO,
    name: "CEO Agent",
    introMessage:
      "I'm your CEO agent. Every morning I review pipeline health, revenue trends, and team activity across the business, then send you a short brief on what actually needs your attention first — not another dashboard to dig through.",
  },
  {
    type: AgentType.SALES,
    name: "Sales Agent",
    introMessage:
      "I'm your Sales agent. I qualify inbound leads against your ideal client profile, chase deals that have gone quiet, and make sure every conversation is logged so nothing slips through the cracks before it closes.",
  },
  {
    type: AgentType.MARKETING,
    name: "Marketing Agent",
    introMessage:
      "I'm your Marketing agent. I draft and schedule content across your channels, keep an eye on what's actually driving traffic and leads, and shift effort toward the campaigns that are working instead of the ones that just feel busy.",
  },
  {
    type: AgentType.PROPOSAL,
    name: "Proposal Agent",
    introMessage:
      "I'm your Proposal agent. Give me a client brief and I'll draft a tailored proposal — scope, pricing, timeline — pulling from your past work and templates, so you're reviewing and sending in minutes instead of starting from a blank page.",
  },
  {
    type: AgentType.OUTREACH,
    name: "Outreach Agent",
    introMessage:
      "I'm your Outreach agent. I research prospects, personalize the first message, and run the follow-up sequence, so your team only steps in once someone actually replies.",
  },
  {
    type: AgentType.CRM,
    name: "CRM Agent",
    introMessage:
      "I'm your CRM agent. I keep contact records, deal stages, and activity history clean and current automatically, so your pipeline reporting is always accurate without anyone doing manual data entry.",
  },
  {
    type: AgentType.ANALYTICS,
    name: "Analytics Agent",
    introMessage:
      "I'm your Analytics agent. I watch your revenue, conversion, and channel metrics continuously and flag anomalies — a stage that's stalling, a channel that's underperforming — while there's still time to act, not after the quarter's already closed.",
  },
];

const PIPELINE_STAGES = [
  { name: "New", order: 0 },
  { name: "Qualified", order: 1 },
  { name: "Proposal Sent", order: 2 },
  { name: "Negotiation", order: 3 },
  { name: "Won", order: 4 },
  { name: "Lost", order: 5 },
] as const;

// The CRM module's enterprise Deal pipeline — separate from PIPELINE_STAGES
// above (which stays Lead Finder's own, unrelated stage set). Exact stage
// list from the CRM phase brief.
const DEAL_STAGES = [
  { name: "New Lead", order: 0 },
  { name: "Qualified", order: 1 },
  { name: "Research", order: 2 },
  { name: "Opportunity", order: 3 },
  { name: "Proposal", order: 4 },
  { name: "Negotiation", order: 5 },
  { name: "Contract", order: 6 },
  { name: "Won", order: 7 },
  { name: "Lost", order: 8 },
  { name: "Archived", order: 9 },
] as const;

/**
 * Resolves the current signed-in user's organization, for pages that need an
 * organizationId but don't have one in the URL yet (e.g. a direct visit, or
 * before an org-creation onboarding step hands one off via query string).
 * Returns the oldest ACTIVE membership's organization, if any.
 */
export async function getUserOrganizationId(): Promise<string | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const membership = await prisma.membership.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: { organizationId: true },
  });

  return membership?.organizationId ?? null;
}

/**
 * Idempotently provisions the default workspace for an organization:
 * Workspace + KnowledgeBase + 6 PipelineStages + 10 DealStages + 7
 * AIAgentInstance rows, and marks the current user's onboarding as
 * complete. Safe to call more than once (e.g. on page refresh) — if the
 * workspace already exists this just reads back the existing agents
 * instead of re-creating anything.
 */
export async function completeOnboarding(organizationId: string): Promise<AgentIntro[]> {
  const parsedOrgId = organizationIdSchema.safeParse(organizationId);
  if (!parsedOrgId.success) {
    throw new Error(parsedOrgId.error.issues[0]?.message ?? "A valid organization is required.");
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    throw new Error("You must be signed in to complete onboarding.");
  }

  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId: parsedOrgId.data } },
  });
  if (!membership || membership.status !== "ACTIVE") {
    throw new Error("You do not have access to this organization.");
  }

  const organization = await prisma.organization.findUnique({
    where: { id: parsedOrgId.data },
    include: { workspace: true, aiAgents: true },
  });
  if (!organization) {
    throw new Error("Organization not found.");
  }

  // Already provisioned — just make sure onboardingCompletedAt is set and
  // hand back the existing agents in canonical display order. Checked by
  // "does every AGENT_DEFINITIONS type already exist" rather than a strict
  // length match — the AI Proposal Review Board lazily provisions FINANCE/
  // LEGAL agents for orgs outside this onboarding flow (see
  // ensureReviewBoardAgentsProvisioned in review-orchestrator.ts), so an org
  // can legitimately have MORE agents than AGENT_DEFINITIONS.length by the
  // time a user re-visits this page. A strict `===` here would fall through
  // to the create branch below and collide with the AIAgentInstance
  // @@unique([organizationId, type]) constraint.
  const hasAllDefaultAgents = AGENT_DEFINITIONS.every((def) => organization.aiAgents.some((agent) => agent.type === def.type));
  if (organization.workspace && hasAllDefaultAgents) {
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { onboardingCompletedAt: true },
    });
    if (!currentUser?.onboardingCompletedAt) {
      await prisma.user.update({
        where: { id: userId },
        data: { onboardingCompletedAt: new Date() },
      });
    }

    const byType = new Map(organization.aiAgents.map((agent) => [agent.type, agent]));
    return AGENT_DEFINITIONS.map((def) => {
      const existing = byType.get(def.type);
      return existing
        ? { type: existing.type, name: existing.name, introMessage: existing.introMessage }
        : def;
    });
  }

  // Workspace and/or some agents may already exist independently of this
  // flow (the AI Proposal Review Board's ensureReviewBoardAgentsProvisioned
  // lazily creates agent rows for orgs that never finished onboarding, and
  // can run before this page is ever visited). Only create what's actually
  // missing — a blind create() of all 7 AGENT_DEFINITIONS here would collide
  // with AIAgentInstance's @@unique([organizationId, type]) constraint for
  // any type that already exists.
  const existingAgentTypes = new Set(organization.aiAgents.map((a) => a.type));
  const missingAgentDefinitions = AGENT_DEFINITIONS.filter((def) => !existingAgentTypes.has(def.type));

  const operations: Prisma.PrismaPromise<unknown>[] = [];
  if (!organization.workspace) {
    operations.push(
      prisma.workspace.create({
        data: {
          organizationId: parsedOrgId.data,
          name: `${organization.name} Workspace`,
          knowledgeBase: { create: {} },
          pipelineStages: { create: PIPELINE_STAGES.map((stage) => ({ ...stage })) },
          dealStages: { create: DEAL_STAGES.map((stage) => ({ ...stage })) },
        },
      }),
    );
  }
  for (const agent of missingAgentDefinitions) {
    operations.push(
      prisma.aIAgentInstance.create({
        data: {
          organizationId: parsedOrgId.data,
          type: agent.type,
          name: agent.name,
          introMessage: agent.introMessage,
        },
      }),
    );
  }
  operations.push(prisma.user.update({ where: { id: userId }, data: { onboardingCompletedAt: new Date() } }));

  if (operations.length > 0) {
    await prisma.$transaction(operations);
  }

  await logAudit({
    userId,
    organizationId: parsedOrgId.data,
    action: "onboarding.completed",
    metadata: { agentsCreated: missingAgentDefinitions.map((a) => a.type), workspaceCreated: !organization.workspace },
  });

  const byType = new Map(organization.aiAgents.map((agent) => [agent.type, agent]));
  return AGENT_DEFINITIONS.map((def) => {
    const existing = byType.get(def.type);
    return existing ? { type: existing.type, name: existing.name, introMessage: existing.introMessage } : def;
  });
}
