import { prisma } from "@/lib/prisma";
import { hashToken, generateRawToken } from "@/lib/client-portal/tokens";
import type { UserTokenPurpose } from "@/generated/prisma/client";

export { hashToken, generateRawToken };

const TOKEN_TTL_MINUTES: Record<UserTokenPurpose, number> = {
  PASSWORD_RESET: 30,
  EMAIL_VERIFICATION: 60 * 24,
};

/** Issues a real single-use token for a User-level flow, hashed at rest — mirrors issueClientAuthToken's pattern. Returns the RAW token for the caller to put in an emailed link. */
export async function issueUserToken(userId: string, purpose: UserTokenPurpose): Promise<string> {
  const raw = generateRawToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES[purpose] * 60_000);

  await prisma.userToken.create({
    data: { userId, tokenHash: hashToken(raw), purpose, expiresAt },
  });

  return raw;
}

export interface ConsumeUserTokenResult {
  ok: boolean;
  userId?: string;
  error?: string;
}

/** Single-use — marks the token consumed on success so it can never be replayed. */
export async function consumeUserToken(rawToken: string, purpose: UserTokenPurpose): Promise<ConsumeUserTokenResult> {
  const tokenHash = hashToken(rawToken);
  const token = await prisma.userToken.findUnique({ where: { tokenHash } });

  if (!token || token.purpose !== purpose) return { ok: false, error: "This link is invalid." };
  if (token.consumedAt) return { ok: false, error: "This link has already been used." };
  if (token.expiresAt < new Date()) return { ok: false, error: "This link has expired — request a new one." };

  await prisma.userToken.update({ where: { id: token.id }, data: { consumedAt: new Date() } });
  return { ok: true, userId: token.userId };
}
