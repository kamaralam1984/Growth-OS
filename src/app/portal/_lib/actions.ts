"use server";

import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";
import { getAppBaseUrl } from "@/lib/outreach/tracking";
import { issueClientAuthToken, consumeClientAuthToken } from "@/lib/client-portal/tokens";
import { verifyPassword, rehashIfNeeded } from "@/lib/auth/password";
import { createClientSession, clearClientSessionCookie, getClientPortalSession, getCurrentSessionId, revokeClientSession } from "@/lib/client-portal/auth";
import { upsertClientDevice } from "@/lib/client-portal/devices";
import { clientMagicLinkRequestSchema, clientPasswordLoginSchema, type ClientMagicLinkRequestInput, type ClientPasswordLoginInput } from "@/lib/validations/client-portal";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Real self-service portal signup boundary: a login is only ever possible
 * for an email that matches a real Client contact already on record in
 * exactly one organization — no open signup, and a same-email-in-2+-orgs
 * collision is a clear error state rather than a silent guess (v1 scope
 * is one-org-per-email; see the schema's Correction #9 note).
 */
async function findOrCreatePortalUser(email: string): Promise<{ ok: true; clientPortalUserId: string } | { ok: false; error: string }> {
  const normalizedEmail = email.trim().toLowerCase();

  const existingPortalUser = await prisma.clientPortalUser.findUnique({ where: { email: normalizedEmail } });
  if (existingPortalUser) return { ok: true, clientPortalUserId: existingPortalUser.id };

  const matchingClients = await prisma.client.findMany({
    where: { email: { equals: normalizedEmail, mode: "insensitive" } },
  });

  if (matchingClients.length === 0) {
    return { ok: false, error: "We couldn't find a client account with that email. Contact your account manager." };
  }
  if (matchingClients.length > 1) {
    return { ok: false, error: "This email is linked to more than one organization — contact support to set up portal access." };
  }

  const client = matchingClients[0]!;
  const portalUser = await prisma.clientPortalUser.create({
    data: { clientId: client.id, organizationId: client.organizationId, email: normalizedEmail, name: client.name },
  });
  return { ok: true, clientPortalUserId: portalUser.id };
}

export async function requestMagicLink(input: ClientMagicLinkRequestInput): Promise<ActionResult> {
  const parsed = clientMagicLinkRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter a valid email address." };

  const resolved = await findOrCreatePortalUser(parsed.data.email);
  if (!resolved.ok) return resolved;

  const rawToken = await issueClientAuthToken(resolved.clientPortalUserId, "LOGIN");
  const verifyUrl = `${getAppBaseUrl()}/portal/verify?token=${rawToken}`;

  await sendEmail({
    to: parsed.data.email,
    subject: "Your KVL GrowthOS Client Portal sign-in link",
    text: `Click this link to sign in to your Client Portal: ${verifyUrl}\n\nThis link expires in 30 minutes and can only be used once.`,
    html: `<p>Click the link below to sign in to your Client Portal:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>This link expires in 30 minutes and can only be used once.</p>`,
  });

  return { ok: true };
}

export interface VerifyMagicLinkResult extends ActionResult {
  redirectTo?: string;
}

export async function verifyMagicLink(rawToken: string, rememberMe: boolean): Promise<VerifyMagicLinkResult> {
  const consumed = await consumeClientAuthToken(rawToken, "LOGIN");
  if (!consumed.ok || !consumed.clientPortalUserId) return { ok: false, error: consumed.error ?? "This link is invalid." };

  const portalUser = await prisma.clientPortalUser.update({
    where: { id: consumed.clientPortalUserId },
    data: { emailVerifiedAt: { set: new Date() } },
  });

  const device = await upsertClientDevice(portalUser.id);
  await createClientSession(portalUser.id, { rememberMe, deviceId: device.id });
  await logAudit({ organizationId: portalUser.organizationId, action: "client_portal.login", metadata: { clientPortalUserId: portalUser.id, method: "magic_link" } });

  return { ok: true, redirectTo: "/portal/dashboard" };
}

export async function loginWithPassword(input: ClientPasswordLoginInput): Promise<VerifyMagicLinkResult> {
  const parsed = clientPasswordLoginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check your details." };

  const portalUser = await prisma.clientPortalUser.findUnique({ where: { email: parsed.data.email.trim().toLowerCase() } });
  if (!portalUser || !portalUser.passwordHash || !portalUser.active) {
    return { ok: false, error: "Incorrect email or password." };
  }

  const isValid = await verifyPassword(parsed.data.password, portalUser.passwordHash);
  if (!isValid) return { ok: false, error: "Incorrect email or password." };

  const rehashed = await rehashIfNeeded(parsed.data.password, portalUser.passwordHash);
  if (rehashed) {
    await prisma.clientPortalUser.update({ where: { id: portalUser.id }, data: { passwordHash: rehashed } });
  }

  const device = await upsertClientDevice(portalUser.id);
  await createClientSession(portalUser.id, { rememberMe: parsed.data.rememberMe, deviceId: device.id });
  await logAudit({ organizationId: portalUser.organizationId, action: "client_portal.login", metadata: { clientPortalUserId: portalUser.id, method: "password" } });

  return { ok: true, redirectTo: "/portal/dashboard" };
}

export async function portalLogout(): Promise<void> {
  const sessionId = await getCurrentSessionId();
  if (sessionId) await revokeClientSession(sessionId);
  await clearClientSessionCookie();
  redirect("/portal/login");
}

export async function getPortalSessionSummary() {
  return getClientPortalSession();
}
