import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { hashToken, generateRawToken } from "./tokens";
import { getClientIpAddress } from "./devices";
import type { ClientPortalUser, Client } from "@/generated/prisma/client";

/**
 * Fully isolated from Auth.js — its own HTTP-only/Secure/SameSite=Lax
 * cookie, its own opaque hashed session token (never a JWT, so individual
 * and bulk revocation are plain DB updates, not a token-blacklist hack).
 * An internal employee session (Auth.js's own cookie) and a client-portal
 * session can coexist in the same browser without collision.
 */
const SESSION_COOKIE = "kvl_client_session";
const SESSION_TTL_HOURS = 12;
const REMEMBER_ME_TTL_DAYS = 30;

export interface ClientPortalSession {
  clientPortalUser: ClientPortalUser;
  client: Client;
  organizationId: string;
}

/** Creates a real session + cookie for a just-authenticated client portal user (magic link or password login). */
export async function createClientSession(clientPortalUserId: string, opts: { rememberMe: boolean; deviceId?: string }): Promise<void> {
  const raw = generateRawToken();
  const expiresAt = opts.rememberMe
    ? new Date(Date.now() + REMEMBER_ME_TTL_DAYS * 24 * 60 * 60_000)
    : new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60_000);
  const ipAddress = await getClientIpAddress();

  await prisma.clientSession.create({
    data: {
      clientPortalUserId,
      deviceId: opts.deviceId,
      tokenHash: hashToken(raw),
      ipAddress,
      rememberMe: opts.rememberMe,
      expiresAt,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, raw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** Reads the session cookie, validates it against a real ClientSession row (not revoked, not expired), and updates lastActiveAt. Returns null rather than throwing — callers decide whether to redirect. */
export async function getClientPortalSession(): Promise<ClientPortalSession | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  const session = await prisma.clientSession.findUnique({
    where: { tokenHash: hashToken(raw) },
    include: { clientPortalUser: { include: { client: true } } },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date() || !session.clientPortalUser.active) {
    return null;
  }

  await prisma.clientSession.update({ where: { id: session.id }, data: { lastActiveAt: new Date() } });

  return {
    clientPortalUser: session.clientPortalUser,
    client: session.clientPortalUser.client,
    organizationId: session.clientPortalUser.organizationId,
  };
}

/** The Client Portal's page-level gate — mirrors requireActiveMembership()'s shape/spirit as a wholly separate function. */
export async function requireClientPortalSession(callbackPath: string): Promise<ClientPortalSession> {
  const session = await getClientPortalSession();
  if (!session) {
    redirect(`/portal/login?callbackUrl=${encodeURIComponent(callbackPath)}`);
  }
  return session;
}

export async function clearClientSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function revokeClientSession(sessionId: string): Promise<void> {
  await prisma.clientSession.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
}

/** "Logout everywhere" — revokes every active session for this client portal user, optionally sparing the current one. */
export async function revokeAllClientSessions(clientPortalUserId: string, exceptSessionId?: string): Promise<void> {
  await prisma.clientSession.updateMany({
    where: { clientPortalUserId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    data: { revokedAt: new Date() },
  });
}

/** Used by the "current session" indicator in Security Settings — matches the raw cookie value against the hashed session, without exposing the hash. */
export async function getCurrentSessionId(): Promise<string | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const session = await prisma.clientSession.findUnique({ where: { tokenHash: hashToken(raw) }, select: { id: true } });
  return session?.id ?? null;
}
