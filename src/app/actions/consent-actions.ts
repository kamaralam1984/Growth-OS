"use server";

import { headers } from "next/headers";

import { auth } from "@/auth";
import { resolveActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { recordConsentDecision } from "@/lib/gdpr/consent";
import { clientIpFromHeaders } from "@/lib/security/client-ip";
import type { CookieConsentPreferences } from "@/lib/cookie-consent";

/**
 * Called from cookie-consent-banner.tsx (rendered on every page, signed in
 * or not) right after the client-side cookie is set. Silently no-ops for a
 * signed-out visitor — the cookie itself is still the real, working
 * consent record for them; this is purely the authenticated-user
 * durable-record layer described in src/lib/gdpr/consent.ts.
 */
export async function persistConsentDecisionAction(preferences: CookieConsentPreferences): Promise<{ persisted: boolean }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { persisted: false };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { persisted: false };

  try {
    const headerList = await headers();
    await recordConsentDecision(membership.organizationId, userId, preferences, {
      ipAddress: clientIpFromHeaders(headerList),
      source: "cookie-banner",
    });
    return { persisted: true };
  } catch (error) {
    console.error("[actions/consent] persistConsentDecisionAction failed:", error);
    return { persisted: false };
  }
}
