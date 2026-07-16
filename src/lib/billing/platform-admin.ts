import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Platform-operator access guard — completely distinct from
 * requireActiveMembership (src/app/dashboard/_lib/require-membership.ts),
 * which is always scoped to ONE organization. This gates the cross-tenant
 * Admin Billing Dashboard (MRR/ARR/churn across every organization) to
 * User.isPlatformOwner only — a flag that is never settable through any
 * organization-scoped UI/action, only ever flipped directly in the
 * database by whoever operates this deployment.
 */
export async function requirePlatformOwner(redirectPath: string): Promise<{ userId: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect(`/login?callbackUrl=${encodeURIComponent(redirectPath)}`);

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isPlatformOwner: true } });
  if (!user?.isPlatformOwner) redirect("/dashboard");

  return { userId };
}

export async function isPlatformOwner(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isPlatformOwner: true } });
  return user?.isPlatformOwner ?? false;
}

const PLATFORM_ORG_SLUG = "__platform__";

/**
 * Idempotent find-or-create of one real Organization row that backs every
 * platform-admin-authored Workflow (src/app/admin/automation/*) — Workflow.
 * organizationId is a real DB foreign key to Organization, so it can't be
 * null or a fake id; a genuine (if never customer-facing) Organization row
 * is the cheapest way to satisfy that constraint without a schema migration
 * or touching the tenant-scoped Workflow model at all. Same idempotent-seed
 * pattern as ensurePlansSeeded()/ensureCoreFeatureFlagsSeeded()
 * (src/lib/billing/plan-catalog.ts, src/lib/billing/feature-flags.ts) —
 * keyed by a well-known unique slug rather than a stored id/env var, so it
 * self-heals if the row is ever deleted.
 *
 * This organization is never visible to real customers — it has no
 * BillingAccount, so any Plan-limit check on it (checkPlanLimit) resolves to
 * "unlimited" (no limit field to compare against), and CRM/communication
 * workflow node types will simply operate on this org's own empty data
 * rather than a real tenant's.
 */
export async function getOrCreatePlatformOrganization(): Promise<{ id: string }> {
  const existing = await prisma.organization.findUnique({ where: { slug: PLATFORM_ORG_SLUG }, select: { id: true } });
  if (existing) return existing;

  return prisma.organization.create({
    data: { slug: PLATFORM_ORG_SLUG, name: "Platform (internal)" },
    select: { id: true },
  });
}
