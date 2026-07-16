/**
 * Cookie consent — shared constants/types for the real consent banner
 * (src/components/cookie-consent-banner.tsx), wired into the root layout
 * (src/app/layout.tsx) so it actually renders for every visitor.
 *
 * PERSISTENCE CHOICE: a first-party cookie, not localStorage. Documented
 * here (and in docs/guides/security-guide.md) so the choice is explicit:
 * a cookie survives across subdomains the same way any other first-party
 * cookie on this origin would and can be read server-side later (e.g. from
 * src/proxy.ts or a Server Component) if this app ever needs to gate
 * server-rendered analytics/marketing tags on consent — localStorage cannot
 * be read from the server at all. The cookie is 1st-party, SameSite=Lax,
 * non-HttpOnly (the banner itself needs to read it client-side to decide
 * whether to render), Secure when served over HTTPS, and holds only the
 * consent decision itself — no PII.
 *
 * HONEST SCOPE NOTE: as of this writing this codebase loads ZERO
 * non-essential cookies/trackers of its own (no analytics/ads pixel, no
 * client-side Sentry — see sentry.server.config.ts / sentry.edge.config.ts,
 * there is no sentry.client.config.ts). This banner and its
 * analytics/marketing toggles are real, working consent infrastructure
 * ready for the day a non-essential cookie is actually added — they are not
 * currently gating any script, because there is currently nothing
 * non-essential to gate. Only the strictly-necessary session/auth cookies
 * NextAuth itself sets (and this consent cookie) are set today, regardless
 * of the choice made here.
 */

export const COOKIE_CONSENT_COOKIE_NAME = "growthos_cookie_consent";

/** ~1 year, matching this app's other long-lived first-party cookies. */
export const COOKIE_CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export interface CookieConsentPreferences {
  /** Strictly-necessary cookies (auth/session, this consent cookie itself) — never actually optional, always true. */
  essential: true;
  analytics: boolean;
  marketing: boolean;
}

export interface CookieConsentRecord {
  version: 1;
  decidedAt: string;
  preferences: CookieConsentPreferences;
}

export const DEFAULT_COOKIE_CONSENT_PREFERENCES: CookieConsentPreferences = {
  essential: true,
  analytics: false,
  marketing: false,
};

export function serializeCookieConsent(preferences: CookieConsentPreferences): string {
  const record: CookieConsentRecord = {
    version: 1,
    decidedAt: new Date().toISOString(),
    preferences,
  };
  return encodeURIComponent(JSON.stringify(record));
}

export function parseCookieConsent(raw: string | undefined | null): CookieConsentRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as CookieConsentRecord;
    if (
      parsed &&
      typeof parsed === "object" &&
      parsed.preferences &&
      typeof parsed.preferences.analytics === "boolean" &&
      typeof parsed.preferences.marketing === "boolean"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/** Reads the raw cookie consent cookie value from a `document.cookie`-shaped string (client-side only). */
export function readCookieConsentFromDocumentCookie(documentCookie: string): CookieConsentRecord | null {
  const match = documentCookie
    .split("; ")
    .find((row) => row.startsWith(`${COOKIE_CONSENT_COOKIE_NAME}=`));
  if (!match) return null;
  return parseCookieConsent(match.slice(COOKIE_CONSENT_COOKIE_NAME.length + 1));
}
