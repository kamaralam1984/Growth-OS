"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const DEFAULT_POLL_MS = 60_000;

/**
 * Complements RealtimeRefresher (mounted globally, SSE-driven, fires on
 * notification/activity/agent-status events) rather than duplicating it.
 * Some page data can change from routine CRUD that never publishes a
 * realtime event (editing a Deal, logging a Subscription/ExpenseEntry,
 * acknowledging an Alert from another tab) — this page-scoped poll is the
 * honest fallback for that silent-edit gap. Deliberately not mounted
 * globally: a page-wide poll would force unnecessary server-component
 * re-renders on pages that don't need this freshness guarantee.
 */
export function PollRefresher({ intervalMs = DEFAULT_POLL_MS }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(interval);
  }, [router, intervalMs]);

  return null;
}
