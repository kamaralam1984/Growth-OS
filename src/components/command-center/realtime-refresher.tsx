"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const THROTTLE_MS = 2000;

/**
 * Mounted once in dashboard/layout.tsx. Opens a real SSE connection
 * (src/app/api/realtime/route.ts) and calls router.refresh() (throttled) on
 * every event — the Notification Bell, Activity Bar, Live AI Panel, and Live
 * AI Timeline are all server components fed by that refresh, so this is
 * genuine push-driven live data rather than stale-until-navigation. A
 * simpler, more honest architecture than hand-patching client state per
 * panel, given none of them keep client-side stores today.
 */
export function RealtimeRefresher({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const lastRefresh = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function scheduleRefresh() {
      const now = Date.now();
      const elapsed = now - lastRefresh.current;
      if (elapsed >= THROTTLE_MS) {
        lastRefresh.current = now;
        router.refresh();
        return;
      }
      if (pending.current) return;
      pending.current = setTimeout(() => {
        pending.current = null;
        lastRefresh.current = Date.now();
        router.refresh();
      }, THROTTLE_MS - elapsed);
    }

    const source = new EventSource(`/api/realtime?orgId=${encodeURIComponent(organizationId)}`);
    source.onmessage = () => scheduleRefresh();
    source.onerror = () => {
      // EventSource auto-reconnects on transient errors; nothing to do here.
    };

    return () => {
      source.close();
      if (pending.current) clearTimeout(pending.current);
    };
  }, [organizationId, router]);

  return null;
}
