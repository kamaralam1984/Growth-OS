"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { disconnectConnection, runHealthCheck, saveConnection } from "@/lib/integrations/connection-store";
import { getAdapter } from "@/lib/integrations/registry";
import type { IntegrationProviderKey } from "@/lib/integrations/types";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const PRIVILEGED_ROLES = new Set(["OWNER", "ADMIN"]);

async function requirePrivileged(): Promise<ActionResult & { organizationId?: string; userId?: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };
  const membership = await prisma.membership.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };
  if (!PRIVILEGED_ROLES.has(membership.role)) return { ok: false, error: "Only owners and admins can manage integrations." };
  return { ok: true, organizationId: membership.organizationId, userId };
}

export async function disconnectIntegration(provider: IntegrationProviderKey): Promise<ActionResult> {
  const access = await requirePrivileged();
  if (!access.ok || !access.organizationId) return access;

  await disconnectConnection(access.organizationId, provider);
  await logAudit({ userId: access.userId, organizationId: access.organizationId, action: "integration.disconnected", metadata: { provider } });
  revalidatePath("/dashboard/settings/integrations");
  return { ok: true };
}

export async function checkIntegrationHealth(provider: IntegrationProviderKey): Promise<ActionResult> {
  const access = await requirePrivileged();
  if (!access.ok || !access.organizationId) return access;

  await runHealthCheck(access.organizationId, provider);
  revalidatePath("/dashboard/settings/integrations");
  return { ok: true };
}

/**
 * Connects an API_KEY-auth adapter (Stripe, Twilio, SendGrid, ...) — no
 * browser redirect, the caller (credential-entry dialog on the Integrations
 * page) submits the raw credential(s) directly. Only ever marks the
 * connection CONNECTED after adapter.connectWithCredentials makes a real
 * verification call against the provider and it succeeds — same
 * never-fake contract as the OAuth callback route.
 */
export async function connectIntegrationWithCredentials(
  provider: IntegrationProviderKey,
  credentials: Record<string, string>,
): Promise<ActionResult> {
  const access = await requirePrivileged();
  if (!access.ok || !access.organizationId || !access.userId) return access;

  let adapter;
  try {
    adapter = getAdapter(provider);
  } catch {
    return { ok: false, error: "Unknown integration provider." };
  }
  if (adapter.authType !== "API_KEY" || !adapter.connectWithCredentials) {
    return { ok: false, error: "This provider doesn't use credential-based connection." };
  }
  if (!adapter.isConfigured()) {
    return { ok: false, error: `${adapter.name} isn't configured yet — an admin needs to set its environment variables first.` };
  }

  try {
    const tokens = await adapter.connectWithCredentials(credentials);
    await saveConnection(access.organizationId, adapter.key, adapter.category, tokens, access.userId);
    await logAudit({ userId: access.userId, organizationId: access.organizationId, action: "integration.connected", metadata: { provider } });
    revalidatePath("/dashboard/settings/integrations");
    return { ok: true };
  } catch (error) {
    console.error(`[integrations] connectWithCredentials failed for ${provider}:`, error);
    return { ok: false, error: error instanceof Error ? error.message : "Could not verify these credentials." };
  }
}
