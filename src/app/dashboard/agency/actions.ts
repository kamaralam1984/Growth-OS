"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { generateUniqueOrgSlug } from "@/lib/slug";
import { sendEmail } from "@/lib/email";
import { getAppBaseUrl } from "@/lib/outreach/tracking";

export interface ActionResult {
  ok: boolean;
  error?: string;
  organizationId?: string;
}

const AGENCY_ADMIN_ROLES = new Set(["OWNER", "ADMIN"]);
const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, mirrors src/app/onboarding/invite/actions.ts

// Same default provisioning shape src/app/onboarding/agents-actions.ts's
// completeOnboarding() uses for a brand-new organization's Workspace —
// duplicated here (rather than imported) because that file is the
// onboarding wizard's own module and isn't a shared export; keeping the new
// tenant's Workspace/KnowledgeBase/stage rows real and non-empty from
// creation is what matters, not sharing the literal array reference.
// completeOnboarding() itself already tolerates a Workspace existing with
// no AIAgentInstance rows yet (see its "missingAgentDefinitions" fallback)
// — those get filled in the first time the invited owner actually visits
// onboarding/dashboard, so this action deliberately does not create them.
const PIPELINE_STAGES = [
  { name: "New", order: 0 },
  { name: "Qualified", order: 1 },
  { name: "Proposal Sent", order: 2 },
  { name: "Negotiation", order: 3 },
  { name: "Won", order: 4 },
  { name: "Lost", order: 5 },
] as const;

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

const createManagedOrgSchema = z.object({
  name: z.string().trim().min(1, "A name is required.").max(200),
  ownerEmail: z.string().trim().toLowerCase().email("Enter a valid owner email address."),
});

async function requireAgencyAdmin(agencyOrganizationId: string) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false as const, error: "You must be signed in." };

  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId: agencyOrganizationId } },
    include: { organization: true },
  });
  if (!membership || membership.status !== "ACTIVE") {
    return { ok: false as const, error: "You do not have access to this organization." };
  }
  if (!membership.organization.isAgency) {
    return {
      ok: false as const,
      error: "Agency mode isn't enabled for this organization. Ask a platform operator to enable it.",
    };
  }
  if (!AGENCY_ADMIN_ROLES.has(membership.role)) {
    return { ok: false as const, error: "Only owners and admins can create managed organizations." };
  }
  return { ok: true as const, userId };
}

/**
 * Creates a real new child tenant Organization under the signed-in user's
 * agency organization (`agencyOrganizationId`), fully initialized the same
 * way any other new organization is (Workspace + KnowledgeBase + pipeline
 * stages), then invites `ownerEmail` to become its real OWNER via the same
 * Invitation model + accept flow every other invite in this app uses
 * (src/app/invite/accept — that page/action work unmodified for an
 * invitation created here). OWNER/ADMIN-of-the-agency-org gated.
 */
export async function createManagedOrganizationAction(
  agencyOrganizationId: string,
  name: string,
  ownerEmail: string,
): Promise<ActionResult> {
  const access = await requireAgencyAdmin(agencyOrganizationId);
  if (!access.ok) return access;

  const parsed = createManagedOrgSchema.safeParse({ name, ownerEmail });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form and try again." };
  }
  const { name: trimmedName, ownerEmail: email } = parsed.data;

  const slug = await generateUniqueOrgSlug(prisma, trimmedName);

  const organization = await prisma.organization.create({
    data: {
      name: trimmedName,
      slug,
      parentAgencyOrganizationId: agencyOrganizationId,
      workspace: {
        create: {
          name: `${trimmedName} Workspace`,
          knowledgeBase: { create: {} },
          pipelineStages: { create: PIPELINE_STAGES.map((stage) => ({ ...stage })) },
          dealStages: { create: DEAL_STAGES.map((stage) => ({ ...stage })) },
        },
      },
    },
  });

  const token = randomUUID();
  await prisma.invitation.create({
    data: {
      email,
      organizationId: organization.id,
      role: "OWNER",
      token,
      expiresAt: new Date(Date.now() + INVITE_EXPIRY_MS),
      invitedById: access.userId,
    },
  });

  const acceptUrl = `${getAppBaseUrl()}/invite/accept?token=${token}`;
  await sendEmail({
    to: email,
    subject: `You're invited to run ${trimmedName} on KVL GrowthOS`,
    text: `Your agency has set up ${trimmedName} for you on KVL GrowthOS.\n\nAccept your invitation to become its owner: ${acceptUrl}\n\nThis link expires in 7 days.`,
    html: `<p>Your agency has set up <strong>${trimmedName}</strong> for you on KVL GrowthOS.</p><p><a href="${acceptUrl}">Accept your invitation</a> to become its owner.</p><p>This link expires in 7 days.</p>`,
  });

  await logAudit({
    userId: access.userId,
    organizationId: agencyOrganizationId,
    action: "agency.managed_organization_created",
    metadata: { managedOrganizationId: organization.id, ownerEmail: email },
  });
  await logAudit({
    userId: access.userId,
    organizationId: organization.id,
    action: "organization.created",
    metadata: { slug: organization.slug, parentAgencyOrganizationId: agencyOrganizationId },
  });

  revalidatePath("/dashboard/agency");
  return { ok: true, organizationId: organization.id };
}
