"use client";

import { useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Cookie } from "lucide-react";

import { DURATIONS } from "@/animations";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  COOKIE_CONSENT_COOKIE_NAME,
  COOKIE_CONSENT_MAX_AGE_SECONDS,
  DEFAULT_COOKIE_CONSENT_PREFERENCES,
  readCookieConsentFromDocumentCookie,
  serializeCookieConsent,
  type CookieConsentPreferences,
} from "@/lib/cookie-consent";

/**
 * Real cookie consent banner — GDPR/ePrivacy (and CCPA/DPDP-India)
 * "get consent before non-essential cookies" requirement. Rendered from the
 * root layout (src/app/layout.tsx) so every first-time visitor sees it,
 * regardless of which page they land on.
 *
 * Shows once per browser (until the persisted decision's max-age expires or
 * is cleared) — see src/lib/cookie-consent.ts's top comment for exactly what
 * is/isn't stored and why a cookie (not localStorage) was chosen.
 *
 * Visibility is derived from `document.cookie` via useSyncExternalStore
 * rather than an effect: the server snapshot is "unknown" (banner hidden)
 * so SSR output always matches the client's pre-hydration paint, and the
 * client snapshot resolves to the real cookie state on/after hydration.
 */
function subscribeToNothing() {
  return () => {};
}

function getServerSnapshot() {
  return null;
}

export function CookieConsentBanner() {
  const cookieHeader = useSyncExternalStore(
    subscribeToNothing,
    () => document.cookie,
    getServerSnapshot,
  );
  const visible = cookieHeader !== null && readCookieConsentFromDocumentCookie(cookieHeader) === null;
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [draftPreferences, setDraftPreferences] = useState<CookieConsentPreferences>(
    DEFAULT_COOKIE_CONSENT_PREFERENCES,
  );
  // document.cookie writes don't notify useSyncExternalStore subscribers —
  // this forces a re-render so the store re-reads the new cookie value.
  const [, forceRerender] = useState(0);

  function persist(preferences: CookieConsentPreferences) {
    const isProduction = window.location.protocol === "https:";
    document.cookie = [
      `${COOKIE_CONSENT_COOKIE_NAME}=${serializeCookieConsent(preferences)}`,
      "path=/",
      `max-age=${COOKIE_CONSENT_MAX_AGE_SECONDS}`,
      "SameSite=Lax",
      isProduction ? "Secure" : "",
    ]
      .filter(Boolean)
      .join("; ");
    setCustomizeOpen(false);
    forceRerender((n) => n + 1);
  }

  function handleAcceptAll() {
    persist({ essential: true, analytics: true, marketing: true });
  }

  function handleRejectNonEssential() {
    persist({ essential: true, analytics: false, marketing: false });
  }

  function handleSaveCustom() {
    persist(draftPreferences);
  }

  return (
    <>
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ duration: DURATIONS.base }}
            className="fixed inset-x-0 bottom-0 z-40 flex justify-center p-4"
            role="dialog"
            aria-label="Cookie consent"
          >
            <Card glass className="w-full max-w-2xl shadow-elevated">
              <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <Cookie className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
                  <p className="text-sm text-muted-foreground">
                    We use strictly-necessary cookies to run this app (sign-in, security). With your
                    permission we&apos;d also like to use optional analytics/marketing cookies. You can change
                    this anytime.
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setCustomizeOpen(true)}>
                    Customize
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={handleRejectNonEssential}>
                    Reject non-essential
                  </Button>
                  <Button type="button" size="sm" onClick={handleAcceptAll}>
                    Accept all
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <Dialog open={customizeOpen} onOpenChange={setCustomizeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cookie preferences</DialogTitle>
            <DialogDescription>
              Choose which optional categories of cookies you allow. Strictly-necessary cookies (sign-in,
              security) can&apos;t be turned off since the app can&apos;t function without them.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <label className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
              <span>
                <span className="block text-sm font-medium text-foreground">Strictly necessary</span>
                <span className="block text-xs text-muted-foreground">
                  Sign-in, session security, and this preference itself. Always on.
                </span>
              </span>
              <input type="checkbox" checked disabled className="mt-0.5" aria-label="Strictly necessary (always on)" />
            </label>

            <label className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
              <span>
                <span className="block text-sm font-medium text-foreground">Analytics</span>
                <span className="block text-xs text-muted-foreground">
                  Usage analytics, if/when this app enables any (none are active today).
                </span>
              </span>
              <input
                type="checkbox"
                className="mt-0.5"
                checked={draftPreferences.analytics}
                onChange={(e) => setDraftPreferences((prev) => ({ ...prev, analytics: e.target.checked }))}
                aria-label="Analytics cookies"
              />
            </label>

            <label className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
              <span>
                <span className="block text-sm font-medium text-foreground">Marketing</span>
                <span className="block text-xs text-muted-foreground">
                  Ad/marketing attribution, if/when this app enables any (none are active today).
                </span>
              </span>
              <input
                type="checkbox"
                className="mt-0.5"
                checked={draftPreferences.marketing}
                onChange={(e) => setDraftPreferences((prev) => ({ ...prev, marketing: e.target.checked }))}
                aria-label="Marketing cookies"
              />
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCustomizeOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSaveCustom}>
              Save preferences
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
