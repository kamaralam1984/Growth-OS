"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { getClientPortalSession, revokeAllClientSessions, revokeClientSession, getCurrentSessionId } from "@/lib/client-portal/auth";
import { clientSetPasswordSchema, type ClientSetPasswordInput } from "@/lib/validations/client-portal";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** First-time password creation needs no current password (email ownership was already proven by magic link); changing an existing password requires the current one. */
export async function setPortalPassword(input: ClientSetPasswordInput & { currentPassword?: string }): Promise<ActionResult> {
  const session = await getClientPortalSession();
  if (!session) return { ok: false, error: "You must be signed in." };

  const parsed = clientSetPasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check your password." };

  if (session.clientPortalUser.passwordHash) {
    if (!input.currentPassword) return { ok: false, error: "Enter your current password." };
    const valid = await verifyPassword(input.currentPassword, session.clientPortalUser.passwordHash);
    if (!valid) return { ok: false, error: "Current password is incorrect." };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  await prisma.clientPortalUser.update({ where: { id: session.clientPortalUser.id }, data: { passwordHash } });
  await prisma.clientSecuritySettings.upsert({
    where: { clientPortalUserId: session.clientPortalUser.id },
    create: { clientPortalUserId: session.clientPortalUser.id, passwordSetAt: new Date() },
    update: { passwordSetAt: new Date() },
  });
  await logAudit({ organizationId: session.organizationId, action: "client_portal.password_set", metadata: { clientPortalUserId: session.clientPortalUser.id } });

  revalidatePath("/portal/security");
  return { ok: true };
}

export async function revokePortalSession(sessionId: string): Promise<ActionResult> {
  const session = await getClientPortalSession();
  if (!session) return { ok: false, error: "You must be signed in." };

  const target = await prisma.clientSession.findUnique({ where: { id: sessionId } });
  if (!target || target.clientPortalUserId !== session.clientPortalUser.id) return { ok: false, error: "Session not found." };

  await revokeClientSession(sessionId);
  revalidatePath("/portal/security");
  return { ok: true };
}

export async function logoutEverywhere(): Promise<ActionResult> {
  const session = await getClientPortalSession();
  if (!session) return { ok: false, error: "You must be signed in." };

  const currentSessionId = await getCurrentSessionId();
  await revokeAllClientSessions(session.clientPortalUser.id, currentSessionId ?? undefined);
  await logAudit({ organizationId: session.organizationId, action: "client_portal.logout_everywhere", metadata: { clientPortalUserId: session.clientPortalUser.id } });

  revalidatePath("/portal/security");
  return { ok: true };
}

export async function toggleDeviceTrusted(deviceId: string): Promise<ActionResult> {
  const session = await getClientPortalSession();
  if (!session) return { ok: false, error: "You must be signed in." };

  const device = await prisma.clientDevice.findUnique({ where: { id: deviceId } });
  if (!device || device.clientPortalUserId !== session.clientPortalUser.id) return { ok: false, error: "Device not found." };

  await prisma.clientDevice.update({ where: { id: deviceId }, data: { trusted: !device.trusted } });
  revalidatePath("/portal/security");
  return { ok: true };
}
