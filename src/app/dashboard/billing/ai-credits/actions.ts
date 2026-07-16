"use server";

import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { notifyOrganizationOwners } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";

const organizationIdSchema = z.string().trim().min(1, "An organization is required.");
const messageSchema = z.string().trim().max(500).optional();

export interface RequestMoreCreditsResult {
  ok: boolean;
  error?: string;
}

/**
 * An honest "request more AI credits" flow — this does NOT grant credits or
 * run a checkout; it creates a real in-app Notification for every
 * OWNER/ADMIN of the organization (notifyOrganizationOwners) plus a real
 * AuditLog entry, so an operator can see the request and act on it (e.g. by
 * granting a purchased top-up directly against AICreditLedger, or reaching
 * out to the requester). Wiring an actual credit-purchase checkout is a
 * separate, parallel payment-gateway task and out of scope here.
 */
export async function requestMoreAICreditsAction(organizationId: string, message?: string): Promise<RequestMoreCreditsResult> {
  const orgId = organizationIdSchema.parse(organizationId);
  const parsedMessage = messageSchema.parse(message);

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId: orgId } },
  });
  if (!membership || membership.status !== "ACTIVE") {
    return { ok: false, error: "You don't have access to this organization." };
  }

  const requester = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
  const requesterLabel = requester?.name || requester?.email || "A team member";
  const noteSuffix = parsedMessage ? ` Note from requester: "${parsedMessage}"` : "";

  await notifyOrganizationOwners({
    organizationId: orgId,
    type: "APPROVAL_REQUESTED",
    title: "More AI credits requested",
    message: `${requesterLabel} requested additional AI credits for this organization.${noteSuffix}`,
  });

  await logAudit({
    userId,
    organizationId: orgId,
    action: "ai_credits.request_submitted",
    metadata: { message: parsedMessage ?? null },
  });

  return { ok: true };
}
