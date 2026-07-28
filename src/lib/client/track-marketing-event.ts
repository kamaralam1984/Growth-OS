"use client";

import { readCookieConsentFromDocumentCookie } from "@/lib/cookie-consent";
import type { MarketingEventInput } from "@/lib/validations/marketing-event";

const SESSION_ID_KEY = "growthos_marketing_session_id";

function getSessionId(): string {
  try {
    const existing = window.sessionStorage.getItem(SESSION_ID_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    window.sessionStorage.setItem(SESSION_ID_KEY, id);
    return id;
  } catch {
    // sessionStorage unavailable (private browsing, etc.) — fall back to a
    // per-call id rather than throwing; this is best-effort telemetry only.
    return crypto.randomUUID();
  }
}

function hasAnalyticsConsent(): boolean {
  const record = readCookieConsentFromDocumentCookie(document.cookie);
  return record?.preferences.analytics === true;
}

/**
 * Fire-and-forget first-party marketing-site telemetry (no third-party
 * vendor). Only sends when the visitor has actively opted into "analytics"
 * in the real cookie-consent banner (src/components/cookie-consent-banner.tsx)
 * — consent defaults to false, so this stays silent until an explicit
 * opt-in, same as the banner's own honest-scope design intends.
 */
export function trackMarketingEvent(
  eventType: MarketingEventInput["eventType"],
  page: string,
  label?: string,
  metadata?: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;
  if (!hasAnalyticsConsent()) return;

  const body: MarketingEventInput = { eventType, page, label, metadata, sessionId: getSessionId() };

  try {
    fetch("/api/marketing-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Never let telemetry break the actual user interaction it's attached to.
  }
}
