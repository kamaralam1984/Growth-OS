"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { logAudit } from "@/lib/audit";
import { subscriptionSchema, type SubscriptionInput } from "@/lib/validations/subscription";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function resolveActiveMembership(userId: string) {
  return prisma.membership.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
}

async function resolveSubscriptionInOrg(userId: string, subscriptionId: string) {
  const membership = await resolveActiveMembership(userId);
  if (!membership) return null;
  const subscription = await prisma.subscription.findUnique({ where: { id: subscriptionId } });
  if (!subscription || subscription.organizationId !== membership.organizationId) return null;
  return { membership, subscription };
}

async function assertBelongsToOrg(organizationId: string, companyId?: string, clientId?: string) {
  if (companyId) {
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company || company.organizationId !== organizationId) return "Selected company was not found.";
  }
  if (clientId) {
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client || client.organizationId !== organizationId) return "Selected client was not found.";
  }
  return null;
}

export interface CreateSubscriptionResult extends ActionResult {
  subscriptionId?: string;
}

function revalidateSubscriptionPaths() {
  revalidatePath("/dashboard/billing/subscriptions");
  revalidatePath("/dashboard/billing");
  revalidatePath("/dashboard/analytics");
}

export async function createSubscription(input: SubscriptionInput): Promise<CreateSubscriptionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the subscription details." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };
  const organizationId = membership.organizationId;

  const relationError = await assertBelongsToOrg(organizationId, parsed.data.companyId || undefined, parsed.data.clientId || undefined);
  if (relationError) return { ok: false, error: relationError };

  try {
    const subscription = await prisma.subscription.create({
      data: {
        organizationId,
        companyId: parsed.data.companyId || null,
        clientId: parsed.data.clientId || null,
        name: parsed.data.name,
        amount: parsed.data.amount,
        currency: parsed.data.currency || null,
        billingCycle: parsed.data.billingCycle,
        status: parsed.data.status,
        startDate: parsed.data.startDate,
        renewalDate: parsed.data.renewalDate ?? null,
        notes: parsed.data.notes || null,
        createdByUserId: userId,
      },
    });

    await logActivity({
      organizationId,
      type: "SYSTEM_EVENT",
      description: `${session.user?.name ?? "A team member"} logged subscription "${subscription.name}".`,
      actorUserId: userId,
      metadata: { subscriptionId: subscription.id },
    });
    await logAudit({ userId, organizationId, action: "billing.subscription_created", metadata: { subscriptionId: subscription.id } });

    revalidateSubscriptionPaths();
    return { ok: true, subscriptionId: subscription.id };
  } catch (error) {
    console.error("[billing] createSubscription failed:", error);
    return { ok: false, error: "Something went wrong creating the subscription. Please try again." };
  }
}

export async function updateSubscription(subscriptionId: string, input: SubscriptionInput): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the subscription details." };

  const resolved = await resolveSubscriptionInOrg(userId, subscriptionId);
  if (!resolved) return { ok: false, error: "Subscription not found." };
  const organizationId = resolved.membership.organizationId;

  const relationError = await assertBelongsToOrg(organizationId, parsed.data.companyId || undefined, parsed.data.clientId || undefined);
  if (relationError) return { ok: false, error: relationError };

  try {
    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        companyId: parsed.data.companyId || null,
        clientId: parsed.data.clientId || null,
        name: parsed.data.name,
        amount: parsed.data.amount,
        currency: parsed.data.currency || null,
        billingCycle: parsed.data.billingCycle,
        status: parsed.data.status,
        startDate: parsed.data.startDate,
        renewalDate: parsed.data.renewalDate ?? null,
        notes: parsed.data.notes || null,
      },
    });

    await logAudit({ userId, organizationId, action: "billing.subscription_updated", metadata: { subscriptionId } });

    revalidateSubscriptionPaths();
    return { ok: true };
  } catch (error) {
    console.error("[billing] updateSubscription failed:", error);
    return { ok: false, error: "Something went wrong updating the subscription. Please try again." };
  }
}

/**
 * Cancels rather than deletes — a CANCELLED row with a real cancelledAt is
 * exactly what getMonthlyChurnRate needs to compute real churn history.
 * Deleting the row would silently erase that history.
 */
export async function cancelSubscription(subscriptionId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveSubscriptionInOrg(userId, subscriptionId);
  if (!resolved) return { ok: false, error: "Subscription not found." };
  const organizationId = resolved.membership.organizationId;

  if (resolved.subscription.status === "CANCELLED") return { ok: true };

  try {
    const now = new Date();
    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: { status: "CANCELLED", cancelledAt: now },
    });

    await logActivity({
      organizationId,
      type: "SYSTEM_EVENT",
      description: `${session.user?.name ?? "A team member"} cancelled subscription "${resolved.subscription.name}".`,
      actorUserId: userId,
      metadata: { subscriptionId },
    });
    await logAudit({ userId, organizationId, action: "billing.subscription_cancelled", metadata: { subscriptionId } });

    revalidateSubscriptionPaths();
    return { ok: true };
  } catch (error) {
    console.error("[billing] cancelSubscription failed:", error);
    return { ok: false, error: "Something went wrong cancelling the subscription. Please try again." };
  }
}
