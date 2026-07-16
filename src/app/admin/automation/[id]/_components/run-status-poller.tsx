"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import type { NodeRunStatus } from "./node-status-badge";

const POLL_MS = 3_000;
const IN_FLIGHT_STATUSES = new Set(["QUEUED", "RUNNING"]);

/**
 * Mirrors src/components/command-center/poll-refresher.tsx's real pattern
 * (a plain setInterval(router.refresh, ms) client component) but scoped
 * tighter: since a WorkflowRun executes asynchronously via BullMQ
 * (src/lib/workflows/engine.ts), this refreshes the canvas's real step
 * statuses every 3s ONLY while at least one step in `stepStatuses` is still
 * QUEUED/RUNNING, and stops the moment every step has a finished status
 * (SUCCESS/FAILED/CANCELLED) — never polls forever like a page-wide
 * always-on refresher would.
 */
export function RunStatusPoller({ stepStatuses }: { stepStatuses: Record<string, NodeRunStatus> }) {
  const router = useRouter();
  const hasInFlightStep = Object.values(stepStatuses).some((s) => IN_FLIGHT_STATUSES.has(s.status));

  useEffect(() => {
    if (!hasInFlightStep) return;
    const interval = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(interval);
  }, [hasInFlightStep, router]);

  return null;
}
