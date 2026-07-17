"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { logActivity } from "@/lib/activity";
import { evaluateAutomationRules } from "@/lib/automation-engine";
import { fireWorkflowTrigger } from "@/lib/workflows/triggers";
import { notifyOrganizationOwners } from "@/lib/notifications";
import { emailOrganizationOwners } from "@/lib/email";
import { ACTIVE_ORG_COOKIE, resolveActiveMembership } from "./_lib/require-membership";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const organizationIdSchema = z.string().trim().min(1);

// ============================= Quick Actions: Create Lead =============================

/**
 * Input for the Quick Actions "Create Lead" inline form. Mirrors the real
 * Lead model fields (see prisma/schema.prisma) — no field here is invented;
 * `estimatedValue` stays optional/null exactly like the schema, so a lead
 * created without one honestly contributes $0 to pipeline value.
 */
const createLeadSchema = z.object({
  name: z.string().trim().min(1, "Give the lead a name."),
  company: z.string().trim().max(200).optional().or(z.literal("")),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").optional().or(z.literal("")),
  estimatedValue: z.coerce.number().nonnegative("Estimated value can't be negative.").optional(),
  // Referral Engine attribution — only ever set via this explicit picker,
  // never AI-inferred. Validated against the caller's own organization
  // below so a user can't attribute a lead to another org's client.
  referredByClientId: z.string().trim().min(1).optional(),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;

export interface CreateLeadResult extends ActionResult {
  leadId?: string;
}

/**
 * Creates a real Lead in the caller's organization, seated in the
 * lowest-`order` PipelineStage of their workspace (the "New" stage seeded by
 * onboarding — see src/app/onboarding/agents-actions.ts's PIPELINE_STAGES).
 * Available to any ACTIVE member, not just OWNER/ADMIN — unlike assigning a
 * task or starting a board meeting, logging a lead you're talking to isn't a
 * privileged action in this app's model.
 */
export async function createLead(input: CreateLeadInput): Promise<CreateLeadResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = createLeadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the lead details." };
  }

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };
  const organizationId = membership.organizationId;

  try {
    const stage = await prisma.pipelineStage.findFirst({
      where: { workspace: { organizationId } },
      orderBy: { order: "asc" },
    });
    if (!stage) {
      return { ok: false, error: "No pipeline stage is configured for your organization yet." };
    }

    let referredByClientId: string | null = null;
    if (parsed.data.referredByClientId) {
      const referringClient = await prisma.client.findUnique({
        where: { id: parsed.data.referredByClientId },
        select: { organizationId: true },
      });
      if (referringClient && referringClient.organizationId === organizationId) {
        referredByClientId = parsed.data.referredByClientId;
      }
    }

    const lead = await prisma.lead.create({
      data: {
        pipelineStageId: stage.id,
        name: parsed.data.name,
        company: parsed.data.company || null,
        email: parsed.data.email || null,
        estimatedValue: parsed.data.estimatedValue ?? null,
        referredByClientId,
      },
    });

    await logActivity({
      organizationId,
      type: "SYSTEM_EVENT",
      description: `${session.user?.name ?? "A team member"} added a new lead: ${lead.name}${lead.company ? ` (${lead.company})` : ""}.`,
      actorUserId: userId,
      metadata: { leadId: lead.id },
    });
    await logAudit({
      userId,
      organizationId,
      action: "dashboard.lead_created",
      metadata: { leadId: lead.id, stageId: stage.id },
    });

    await evaluateAutomationRules(organizationId, "LEAD_CREATED", { subject: lead.name, leadId: lead.id });
    await fireWorkflowTrigger(organizationId, "LEAD_CREATED", { leadId: lead.id, name: lead.name, company: lead.company, email: lead.email, estimatedValue: lead.estimatedValue });

    // Real "Urgent Opportunity" signal: compare against the org's own
    // historical average lead value (not an arbitrary hardcoded dollar
    // figure) — only fires once there's enough prior data to make the
    // comparison meaningful, and only when this lead genuinely stands out.
    if (lead.estimatedValue != null) {
      const priorLeads = await prisma.lead.findMany({
        where: {
          pipelineStage: { workspace: { organizationId } },
          estimatedValue: { not: null },
          id: { not: lead.id },
        },
        select: { estimatedValue: true },
      });
      if (priorLeads.length >= 3) {
        const avg = priorLeads.reduce((sum, l) => sum + (l.estimatedValue ?? 0), 0) / priorLeads.length;
        if (avg > 0 && lead.estimatedValue > avg * 2) {
          await notifyOrganizationOwners({
            organizationId,
            type: "CRITICAL_ALERT",
            title: `Urgent opportunity: ${lead.name}`,
            message: `Estimated value is more than double your org's average lead value — worth prioritizing.`,
          });
          await emailOrganizationOwners({
            organizationId,
            subject: `Urgent opportunity: ${lead.name}`,
            text: `A new lead, "${lead.name}"${lead.company ? ` (${lead.company})` : ""}, has an estimated value well above your organization's average — worth prioritizing.`,
          });
        }
      }
    }

    revalidatePath("/dashboard");
    return { ok: true, leadId: lead.id };
  } catch (error) {
    console.error("[dashboard] createLead failed:", error);
    return { ok: false, error: "Something went wrong creating the lead. Please try again." };
  }
}

/**
 * Workspace switcher: persists the chosen organization as the active one for
 * this browser via a cookie, after verifying the caller actually has an
 * ACTIVE membership in it (never trusts a bare id from the client).
 */
export async function setActiveOrganization(organizationId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = organizationIdSchema.safeParse(organizationId);
  if (!parsed.success) return { ok: false, error: "Invalid organization." };

  try {
    const membership = await prisma.membership.findUnique({
      where: { userId_organizationId: { userId, organizationId: parsed.data } },
    });
    if (!membership || membership.status !== "ACTIVE") {
      return { ok: false, error: "You do not have access to that organization." };
    }

    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_ORG_COOKIE, parsed.data, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });

    await logAudit({ userId, organizationId: parsed.data, action: "dashboard.switched_organization" });
    revalidatePath("/dashboard", "layout");
    return { ok: true };
  } catch (error) {
    console.error("[dashboard] setActiveOrganization failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/** Signs the current user out and returns them to /login. */
export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
