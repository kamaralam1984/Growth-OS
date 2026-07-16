/**
 * Idempotently provisions a real, fully-onboarded fixture organization +
 * owner user directly via Prisma — the same end state
 * completeOnboarding() (src/app/onboarding/agents-actions.ts) would leave
 * behind, so every authenticated E2E spec lands on a dashboard with real
 * (if minimal) data instead of an empty-state/onboarding redirect.
 *
 * Run as a standalone `tsx` script (see e2e/global-setup.ts, which spawns
 * this via child_process) rather than imported directly by
 * playwright.config.ts/global-setup.ts: this app's Prisma client
 * (src/generated/prisma/client.ts) is generated as ESM-only (it uses
 * `import.meta.url`), which is genuinely incompatible with Playwright
 * Test's own CJS-by-default config/global-setup transform pipeline —
 * running it under `tsx` (a real ESM-aware loader, already a devDependency
 * and used elsewhere in this repo, e.g. scripts/) sidesteps that
 * incompatibility without needing to flip this whole package to
 * `"type": "module"` just for E2E test infra.
 *
 * Fixed, clearly-named email (not a random/timestamped one) so repeated
 * local/CI runs upsert the same row instead of accumulating duplicate
 * fixture orgs. Credentials/slug live in ./fixture-constants.ts, shared
 * with global-setup.ts (which signs in as this user afterwards) and
 * playwright.config.ts.
 */
// This script runs standalone via `tsx` (see e2e/global-setup.ts), outside
// Next.js's own automatic .env loading — load it explicitly, same
// convention as prisma.config.ts, so DATABASE_URL etc. are actually set.
import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { AgentType } from "@/generated/prisma/client";

import { E2E_FIXTURE_EMAIL, E2E_FIXTURE_PASSWORD, E2E_FIXTURE_ORG_SLUG } from "./fixture-constants";

// Mirrors completeOnboarding()'s AGENT_DEFINITIONS (src/app/onboarding/agents-actions.ts)
// and PIPELINE_STAGES/DEAL_STAGES (src/app/onboarding/actions.ts) — duplicated here
// rather than imported (those live in "use server" action modules not meant to be
// imported by test infra) so the fixture org ends up in exactly the same
// fully-provisioned shape completeOnboarding() would have left it in.
const AGENT_TYPES: AgentType[] = [
  AgentType.CEO,
  AgentType.SALES,
  AgentType.MARKETING,
  AgentType.PROPOSAL,
  AgentType.OUTREACH,
  AgentType.CRM,
  AgentType.ANALYTICS,
];

const PIPELINE_STAGES = [
  { name: "New", order: 0 },
  { name: "Qualified", order: 1 },
  { name: "Proposal Sent", order: 2 },
  { name: "Negotiation", order: 3 },
  { name: "Won", order: 4 },
  { name: "Lost", order: 5 },
];

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
];

async function seedFixtureOrg(): Promise<void> {
  const passwordHash = await hashPassword(E2E_FIXTURE_PASSWORD);

  const user = await prisma.user.upsert({
    where: { email: E2E_FIXTURE_EMAIL },
    create: {
      email: E2E_FIXTURE_EMAIL,
      name: "E2E Fixture Owner",
      firstName: "E2E",
      lastName: "Fixture Owner",
      password: passwordHash,
      emailVerified: new Date(),
      onboardingCompletedAt: new Date(),
    },
    update: {
      // Re-assert every real invariant a golden-path spec relies on, so a
      // fixture row left in a weird state by an interrupted prior run (e.g.
      // a manually-changed password, a lockout from a failed-login spec)
      // never carries over into this run.
      password: passwordHash,
      emailVerified: new Date(),
      onboardingCompletedAt: new Date(),
      failedLoginAttempts: 0,
      lockedUntil: null,
      sessionInvalidatedAt: null,
      twoFactorEnabled: false,
      twoFactorSecret: null,
    },
  });

  const organization = await prisma.organization.upsert({
    where: { slug: E2E_FIXTURE_ORG_SLUG },
    create: {
      slug: E2E_FIXTURE_ORG_SLUG,
      name: "E2E Fixture Org",
      onboardingStep: 3,
      currency: "USD",
    },
    update: {
      onboardingStep: 3,
    },
  });

  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: user.id, organizationId: organization.id } },
    create: { userId: user.id, organizationId: organization.id, role: "OWNER", status: "ACTIVE" },
    update: { role: "OWNER", status: "ACTIVE" },
  });

  const existingWorkspace = await prisma.workspace.findUnique({ where: { organizationId: organization.id } });
  if (!existingWorkspace) {
    await prisma.workspace.create({
      data: {
        organizationId: organization.id,
        name: `${organization.name} Workspace`,
        knowledgeBase: { create: {} },
        pipelineStages: { create: PIPELINE_STAGES },
        dealStages: { create: DEAL_STAGES },
      },
    });
  }

  const existingAgentTypes = new Set(
    (await prisma.aIAgentInstance.findMany({ where: { organizationId: organization.id }, select: { type: true } })).map(
      (a) => a.type,
    ),
  );
  const missingAgentTypes = AGENT_TYPES.filter((type) => !existingAgentTypes.has(type));
  if (missingAgentTypes.length > 0) {
    await prisma.aIAgentInstance.createMany({
      data: missingAgentTypes.map((type) => ({
        organizationId: organization.id,
        type,
        name: `${type} Agent`,
        introMessage: `I'm your ${type} agent (seeded E2E fixture).`,
      })),
    });
  }
}

seedFixtureOrg()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error("[e2e/seed-fixture] failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
