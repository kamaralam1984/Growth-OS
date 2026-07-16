import { randomUUID, randomBytes, createHash } from "node:crypto";

import { prisma } from "@/lib/prisma";
import type { ClientTokenPurpose } from "@/generated/prisma/client";

/** SHA-256 hex hash — every token (auth token, session token) is stored hashed, the raw value only ever exists in the emailed URL / cookie, never in the database. */
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function generateRawToken(): string {
  return `${randomUUID()}${randomBytes(16).toString("hex")}`;
}

const TOKEN_TTL_MINUTES: Record<ClientTokenPurpose, number> = {
  LOGIN: 30,
  EMAIL_VERIFY: 60 * 24,
  PASSWORD_RESET: 30,
};

/** Issues a real single-use token for one of the 3 "prove you own this email" flows, hashed at rest. Returns the RAW token — the only place it's ever visible — for the caller to put in an emailed link. */
export async function issueClientAuthToken(clientPortalUserId: string, purpose: ClientTokenPurpose): Promise<string> {
  const raw = generateRawToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES[purpose] * 60_000);

  await prisma.clientAuthToken.create({
    data: { clientPortalUserId, tokenHash: hashToken(raw), purpose, expiresAt },
  });

  return raw;
}

export interface ConsumeTokenResult {
  ok: boolean;
  clientPortalUserId?: string;
  error?: string;
}

/** Single-use — marks the token consumed on success so it can never be replayed. */
export async function consumeClientAuthToken(rawToken: string, purpose: ClientTokenPurpose): Promise<ConsumeTokenResult> {
  const tokenHash = hashToken(rawToken);
  const token = await prisma.clientAuthToken.findUnique({ where: { tokenHash } });

  if (!token || token.purpose !== purpose) return { ok: false, error: "This link is invalid." };
  if (token.consumedAt) return { ok: false, error: "This link has already been used." };
  if (token.expiresAt < new Date()) return { ok: false, error: "This link has expired — request a new one." };

  await prisma.clientAuthToken.update({ where: { id: token.id }, data: { consumedAt: new Date() } });
  return { ok: true, clientPortalUserId: token.clientPortalUserId };
}
