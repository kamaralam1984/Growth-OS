"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const THROTTLE_MS = 2000;

/**
 * Mounted inside a single project's comments/tickets panel. Opens a real SSE
 * connection scoped to this project (src/app/api/portal/realtime/route.ts)
 * and calls router.refresh() (throttled) whenever a new comment or ticket
 * lands on this thread — the client-portal counterpart to
 * src/components/command-center/realtime-refresher.tsx, reusing the same
 * event-bus/SSE mechanism across the portal's separate trust boundary
 * rather than a second transport. Same single-instance in-memory
 * limitation as the underlying event bus (see src/lib/realtime/event-bus.ts)
 * — genuine push within one Node process, not multi-instance pub/sub.
 */
export function PortalRealtimeRefresher({ projectId }: { projectId: string }) {
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

    const source = new EventSource(`/api/portal/realtime?projectId=${encodeURIComponent(projectId)}`);
    source.onmessage = () => scheduleRefresh();
    source.onerror = () => {
      // EventSource auto-reconnects on transient errors; nothing to do here.
    };

    return () => {
      source.close();
      if (pending.current) clearTimeout(pending.current);
    };
  }, [projectId, router]);

  return null;
}
