"use server";

import { randomUUID } from "crypto";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { inviteSchema } from "@/lib/validations/invitation";
import { sendEmail } from "@/lib/email";
import { getAppBaseUrl } from "@/lib/outreach/tracking";
import { checkPlanLimit } from "@/lib/billing/usage-metering";

const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const INVITER_ROLES = new Set(["OWNER", "ADMIN"]);

const inviteBatchSchema = z
  .array(inviteSchema)
  .min(1, "Add at least one teammate to invite.")
  .max(25, "You can invite up to 25 teammates at a time.");

export interface InviteResult {
  email: string;
  status: "sent" | "already_member" | "error";
  message?: string;
}

/**
 * Invites one or more teammates to an organization. Only OWNER/ADMIN members
 * may invite. The accept link is sent via the same real sendEmail helper
 * used everywhere else in the app — with no EMAIL_SERVER configured it
 * degrades to the same "[DEV] ..." console-log fallback sendEmail already
 * has, so this is fully testable end-to-end without SMTP either way.
 */
export async function inviteTeamMembers(
  organizationId: string,
  invites: { email: string; role: string }[],
): Promise<InviteResult[]> {
  const orgId = z.string().trim().min(1, "An organization is required.").parse(organizationId);

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    throw new Error("You must be signed in to invite teammates.");
  }

  const rate = checkRateLimit(`invite:${userId}`, { limit: 20, windowMs: 15 * 60_000 });
  if (!rate.allowed) {
    throw new Error("Too many invitations sent recently. Please try again in a few minutes.");
  }

  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId: orgId } },
  });
  if (!membership || membership.status !== "ACTIVE" || !INVITER_ROLES.has(membership.role)) {
    throw new Error("Only owners and admins can invite teammates.");
  }

  const parsedInvites = inviteBatchSchema.parse(invites);

  const organization = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!organization) {
    throw new Error("Organization not found.");
  }

  // Real plan-limit enforcement — this org's current Plan.userLimit (checked
  // against the real, live ACTIVE-membership count) gates whether it can
  // invite any more teammates at all. Checked once up front rather than
  // per-invite: an Invitation isn't a seat by itself (a seat is only
  // consumed once accepted), so this is an honest "you're already at/over
  // your seat limit" gate rather than a perfectly race-free per-seat
  // reservation.
  const seatLimit = await checkPlanLimit(orgId, "USERS");
  if (!seatLimit.allowed) {
    throw new Error(seatLimit.reason ?? "This organization has reached its plan's user limit.");
  }

  const results: InviteResult[] = [];

  for (const invite of parsedInvites) {
    try {
      const existingMembership = await prisma.membership.findFirst({
        where: {
          organizationId: orgId,
          status: "ACTIVE",
          user: { email: invite.email },
        },
      });
      if (existingMembership) {
        results.push({ email: invite.email, status: "already_member", message: "Already a member of this organization." });
        continue;
      }

      // Revoke any still-pending invitation for this email so only the
      // newest token is valid.
      await prisma.invitation.updateMany({
        where: { organizationId: orgId, email: invite.email, status: "PENDING" },
        data: { status: "REVOKED" },
      });

      const token = randomUUID();
      await prisma.invitation.create({
        data: {
          email: invite.email,
          organizationId: orgId,
          role: invite.role,
          token,
          expiresAt: new Date(Date.now() + INVITE_EXPIRY_MS),
          invitedById: userId,
        },
      });

      const acceptUrl = `${getAppBaseUrl()}/invite/accept?token=${token}`;

      await sendEmail({
        to: invite.email,
        subject: `You're invited to join ${organization.name} on KVL GrowthOS`,
        text: `You've been invited to join ${organization.name} on KVL GrowthOS as ${invite.role}.\n\nAccept your invitation: ${acceptUrl}\n\nThis link expires in 7 days.`,
        html: `<p>You've been invited to join <strong>${organization.name}</strong> on KVL GrowthOS as <strong>${invite.role}</strong>.</p><p><a href="${acceptUrl}">Accept your invitation</a></p><p>This link expires in 7 days.</p>`,
      });

      await logAudit({
        userId,
        organizationId: orgId,
        action: "invitation.created",
        metadata: { email: invite.email, role: invite.role },
      });

      results.push({ email: invite.email, status: "sent" });
    } catch (error) {
      results.push({
        email: invite.email,
        status: "error",
        message: error instanceof Error ? error.message : "Failed to create invitation.",
      });
    }
  }

  return results;
}
