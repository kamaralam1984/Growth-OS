"use server";

import { headers } from "next/headers";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { startMarketplaceCheckout, markManualMarketplaceOrderPaid } from "@/lib/marketplace/checkout";
import { installListing, uninstallListing, rollbackInstall, MarketplaceInstallError } from "@/lib/marketplace/install-engine";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function resolveActiveMembership(userId: string) {
  return prisma.membership.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
}

async function originUrl(): Promise<string> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export interface PurchaseListingResult extends ActionResult {
  checkoutUrl?: string;
  installId?: string;
  requiresManualConfirmation?: boolean;
}

/** Free listings install immediately; paid listings return a real checkoutUrl to redirect to. */
export async function purchaseListingAction(listingId: string): Promise<PurchaseListingResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };
  if (membership.role !== "OWNER" && membership.role !== "ADMIN") return { ok: false, error: "Only owners/admins can install marketplace listings." };

  const origin = await originUrl();
  const result = await startMarketplaceCheckout({
    organizationId: membership.organizationId,
    listingId,
    buyerUserId: userId,
    successUrl: `${origin}/dashboard/marketplace/installed?purchased=1`,
    cancelUrl: `${origin}/dashboard/marketplace/${listingId}`,
  });

  return result;
}

export async function uninstallListingAction(listingId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };
  if (membership.role !== "OWNER" && membership.role !== "ADMIN") return { ok: false, error: "Only owners/admins can uninstall marketplace listings." };

  try {
    await uninstallListing({ organizationId: membership.organizationId, listingId, uninstalledByUserId: userId });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not uninstall this listing." };
  }
}

export async function rollbackListingAction(listingId: string, targetVersionId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };
  if (membership.role !== "OWNER" && membership.role !== "ADMIN") return { ok: false, error: "Only owners/admins can roll back marketplace listings." };

  try {
    await rollbackInstall({ organizationId: membership.organizationId, listingId, targetVersionId, userId });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not roll back this listing." };
  }
}

/** Re-attempts install for a real MarketplaceInstall row stuck FAILED (e.g. a real payment succeeded but the install step errored) — never re-charges. */
export async function retryInstallAction(listingId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };
  if (membership.role !== "OWNER" && membership.role !== "ADMIN") return { ok: false, error: "Only owners/admins can retry an install." };

  try {
    await installListing({ organizationId: membership.organizationId, listingId, installedByUserId: userId });
    return { ok: true };
  } catch (error) {
    if (error instanceof MarketplaceInstallError) return { ok: false, error: error.message };
    return { ok: false, error: error instanceof Error ? error.message : "Install retry failed." };
  }
}

export async function confirmManualPaymentAction(orderId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };
  if (membership.role !== "OWNER" && membership.role !== "ADMIN") return { ok: false, error: "Only owners/admins can confirm a manual payment." };

  const order = await prisma.marketplaceOrder.findUnique({ where: { id: orderId } });
  if (!order || order.organizationId !== membership.organizationId) return { ok: false, error: "Order not found." };

  return markManualMarketplaceOrderPaid(orderId, userId);
}
