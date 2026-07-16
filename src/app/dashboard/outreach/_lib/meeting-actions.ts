"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { notifyUser } from "@/lib/notifications";
import { AINotConnectedError, AIBillingError, isAIBillingError } from "@/lib/ai/client";
import { generateMeetingRequest } from "@/lib/outreach/meeting-generator";

export interface ActionResult {
  ok: boolean;
  error?: string;
  errorKind?: "not_connected" | "billing" | "generic";
}

function describeAIError(error: unknown): ActionResult {
  if (error instanceof AINotConnectedError) {
    return { ok: false, errorKind: "not_connected", error: "AI is not connected — no ANTHROPIC_API_KEY is configured for this environment." };
  }
  if (error instanceof AIBillingError || isAIBillingError(error)) {
    return { ok: false, errorKind: "billing", error: "AI is connected but the account has no API credits — add credits at console.anthropic.com/settings/billing." };
  }
  console.error("[outreach] meeting request failed:", error);
  return { ok: false, errorKind: "generic", error: "Something went wrong. Please try again." };
}

async function resolveActiveMembership(userId: string) {
  return prisma.membership.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
}

export interface RequestMeetingResult extends ActionResult {
  meetingId?: string;
  draftId?: string;
}

/** Generates a real, grounded meeting-request email + agenda, and creates the OutreachMeeting record it belongs to. */
export async function requestMeeting(contactId: string, proposedTimes: string[], campaignId?: string): Promise<RequestMeetingResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact || contact.organizationId !== membership.organizationId) return { ok: false, error: "Contact not found." };

  try {
    const content = await generateMeetingRequest(contactId, proposedTimes);

    const draft = await prisma.emailDraft.create({
      data: {
        organizationId: membership.organizationId,
        campaignId: campaignId ?? null,
        contactId,
        channel: "EMAIL",
        purpose: "MEETING_REQUEST",
        tone: "PROFESSIONAL",
        subject: content.subject,
        body: content.body,
        personalizationNotes: content.personalizationNotes,
        status: "DRAFT",
        trackingToken: crypto.randomUUID(),
      },
    });

    const meeting = await prisma.outreachMeeting.create({
      data: {
        organizationId: membership.organizationId,
        contactId,
        campaignId: campaignId ?? null,
        emailDraftId: draft.id,
        title: content.subject,
        agenda: content.agenda,
        discussionTopics: content.discussionTopics,
        proposedTimes: proposedTimes.length > 0 ? proposedTimes : undefined,
        status: "REQUESTED",
      },
    });

    await logAudit({ userId, organizationId: membership.organizationId, action: "outreach.meeting_requested", metadata: { contactId, meetingId: meeting.id } });
    revalidatePath("/dashboard/outreach");
    revalidatePath(`/dashboard/outreach/contacts/${contactId}`);
    return { ok: true, meetingId: meeting.id, draftId: draft.id };
  } catch (error) {
    return describeAIError(error);
  }
}

async function resolveMeetingInOrg(userId: string, meetingId: string) {
  const membership = await resolveActiveMembership(userId);
  if (!membership) return null;
  const meeting = await prisma.outreachMeeting.findUnique({ where: { id: meetingId }, include: { contact: true } });
  if (!meeting || meeting.organizationId !== membership.organizationId) return null;
  return { membership, meeting };
}

export async function confirmMeeting(meetingId: string, scheduledAt: Date): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveMeetingInOrg(userId, meetingId);
  if (!resolved) return { ok: false, error: "Meeting not found." };

  await prisma.outreachMeeting.update({ where: { id: meetingId }, data: { status: "CONFIRMED", scheduledAt } });
  await prisma.contact.update({ where: { id: resolved.meeting.contactId }, data: { status: "MEETING_BOOKED" } });

  // Sync back to the linked Company — a confirmed meeting is a real CRM-worthy signal.
  if (resolved.meeting.contact.companyId) {
    const company = await prisma.company.findUnique({ where: { id: resolved.meeting.contact.companyId } });
    if (company?.status === "PROSPECT") {
      await prisma.company.update({ where: { id: resolved.meeting.contact.companyId }, data: { status: "LEAD" } });
    }
  }

  await notifyUser({
    userId,
    organizationId: resolved.membership.organizationId,
    type: "MEETING_STARTED",
    title: "Meeting confirmed",
    message: `${resolved.meeting.title} with ${resolved.meeting.contact.firstName} confirmed for ${scheduledAt.toLocaleString()}.`,
  });

  revalidatePath("/dashboard/outreach");
  return { ok: true };
}

export async function cancelMeeting(meetingId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveMeetingInOrg(userId, meetingId);
  if (!resolved) return { ok: false, error: "Meeting not found." };

  await prisma.outreachMeeting.update({ where: { id: meetingId }, data: { status: "CANCELLED" } });
  revalidatePath("/dashboard/outreach");
  return { ok: true };
}
