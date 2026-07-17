import { prisma } from "@/lib/prisma";
import type { CookieConsentPreferences } from "@/lib/cookie-consent";
import type { ConsentRecord } from "@/generated/prisma/client";

/**
 * Server-side GDPR consent persistence for AUTHENTICATED users — the
 * companion to the existing client-side cookie-consent-banner.tsx, which
 * already handles anonymous, pre-auth consent (a first-party cookie, no
 * server round-trip required). Once a user is signed in, their decision is
 * ALSO written here as a real, durable, queryable record — the actual gap
 * the compliance audit identified ("no explicit consent data model beyond
 * the cookie banner"). Writes one row per toggle-able category so each can
 * be independently queried/exported; `essential` is never recorded since
 * it's always true and not a real choice.
 */
export async function recordConsentDecision(
  organizationId: string,
  userId: string,
  preferences: CookieConsentPreferences,
  opts?: { ipAddress?: string; source?: string },
): Promise<ConsentRecord[]> {
  const source = opts?.source ?? "cookie-banner";

  return prisma.$transaction([
    prisma.consentRecord.create({
      data: { organizationId, userId, consentType: "COOKIES_ANALYTICS", granted: preferences.analytics, ipAddress: opts?.ipAddress, source },
    }),
    prisma.consentRecord.create({
      data: { organizationId, userId, consentType: "COOKIES_MARKETING", granted: preferences.marketing, ipAddress: opts?.ipAddress, source },
    }),
  ]);
}

export async function getLatestConsent(organizationId: string, userId: string): Promise<Record<string, ConsentRecord | null>> {
  const records = await prisma.consentRecord.findMany({
    where: { organizationId, userId },
    orderBy: { createdAt: "desc" },
  });
  const latest: Record<string, ConsentRecord | null> = {};
  for (const record of records) {
    if (!(record.consentType in latest)) latest[record.consentType] = record;
  }
  return latest;
}
