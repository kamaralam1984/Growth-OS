import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";
import { checkRateLimit, type RateLimitResult } from "@/lib/rate-limit";
import type { ApiKeyScope } from "@/lib/auth/api-key-scopes";

export interface ApiKeyAuthResult {
  organizationId: string;
  apiKeyId: string;
  scopes: string[];
  rateLimitPerHour: number;
}

/**
 * Verifies a bearer `ApiKey` (src/app/profile/actions.ts's createApiKey) on
 * an inbound request. `prefix` narrows the candidate rows (hashedKey is a
 * per-key-salted bcrypt hash, so it can't be looked up directly); each
 * matching, non-revoked candidate is bcrypt-compared against the raw key.
 * Returns null on any missing/malformed/invalid/revoked key — never throws.
 */
export async function verifyApiKeyAuth(request: Request): Promise<ApiKeyAuthResult | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const rawKey = authHeader.slice("Bearer ".length).trim();
  if (!rawKey) return null;

  const prefix = rawKey.slice(0, 12);

  try {
    const candidates = await prisma.apiKey.findMany({
      where: { prefix, revokedAt: null },
    });

    for (const candidate of candidates) {
      if (await bcrypt.compare(rawKey, candidate.hashedKey)) {
        await prisma.apiKey.update({
          where: { id: candidate.id },
          data: { lastUsedAt: new Date() },
        });
        return {
          organizationId: candidate.organizationId,
          apiKeyId: candidate.id,
          scopes: candidate.scopes,
          rateLimitPerHour: candidate.rateLimitPerHour,
        };
      }
    }
    return null;
  } catch (error) {
    console.error("[auth/api-key] verifyApiKeyAuth failed:", error);
    return null;
  }
}

/** Real membership check against the scopes granted to this key. */
export function hasApiKeyScope(auth: ApiKeyAuthResult, scope: ApiKeyScope): boolean {
  return auth.scopes.includes(scope);
}

/**
 * Enforces this key's own `rateLimitPerHour` using the shared in-memory
 * sliding-window limiter, keyed per-ApiKey so one key's traffic can never
 * exhaust another key's budget.
 */
export async function checkApiKeyRateLimit(auth: ApiKeyAuthResult): Promise<RateLimitResult> {
  return checkRateLimit(`apikey:${auth.apiKeyId}`, {
    limit: auth.rateLimitPerHour,
    windowMs: 3_600_000,
  });
}
