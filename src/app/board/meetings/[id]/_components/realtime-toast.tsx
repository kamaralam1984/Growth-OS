"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles } from "lucide-react";

import { EASES } from "@/animations";

const THROTTLE_MS = 2000;
const TOAST_LABEL: Record<string, string> = {
  activity: "The boardroom has new activity",
  agent_status: "An agent's status just changed",
  notification: "New notification",
};

/**
 * War Room-local real-time layer: subscribes to the same SSE stream the
 * Command Center uses (src/app/api/realtime/route.ts), refreshes the page
 * (throttled) on every event for this org, and surfaces a small floating
 * toast — genuine push notifications, not a fake "someone is typing" effect.
 */
export function RealtimeToast({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const lastRefresh = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    source.onmessage = (event) => {
      scheduleRefresh();
      try {
        const parsed = JSON.parse(event.data) as { kind: string };
        setToast(TOAST_LABEL[parsed.kind] ?? "The boardroom updated");
        if (toastTimeout.current) clearTimeout(toastTimeout.current);
        toastTimeout.current = setTimeout(() => setToast(null), 3500);
      } catch {
        // Heartbeat/comment lines aren't JSON — ignore.
      }
    };

    return () => {
      source.close();
      if (pending.current) clearTimeout(pending.current);
      if (toastTimeout.current) clearTimeout(toastTimeout.current);
    };
  }, [organizationId, router]);

  return (
    <div className="pointer-events-none fixed right-4 top-20 z-50 flex flex-col items-end gap-2">
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.95 }}
            transition={{ duration: 0.25, ease: EASES.outExpo }}
            className="glass-panel-strong flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium text-foreground shadow-glow-primary"
          >
            <Sparkles className="size-3.5 text-primary" />
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
