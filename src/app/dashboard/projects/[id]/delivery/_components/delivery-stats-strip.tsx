"use client";

import { useEffect, useState } from "react";
import { Clock, Users2, ListChecks, Gavel, ShieldAlert, Gauge } from "lucide-react";

import { AnimatedCounter } from "@/components/ui/animated-counter";

export interface DeliveryStatsStripProps {
  startedAt: string | null;
  endedAt: string | null;
  participants: number;
  recommendationsCount: number;
  decisionsMade: number;
  pendingApprovals: number;
  overallHealthScore: number | null;
}

function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function Stat({ icon: Icon, label, children }: { icon: typeof Clock; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-card/40 px-4 py-3">
      <Icon className="size-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold text-foreground">{children}</p>
      </div>
    </div>
  );
}

/** Forked from War Room's LiveStatsStrip (Correction: same shape, "Revenue opportunity" swapped for real Project Health Score — this board has no lead/deal to link). */
export function DeliveryStatsStrip({ startedAt, endedAt, participants, recommendationsCount, decisionsMade, pendingApprovals, overallHealthScore }: DeliveryStatsStripProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endedAt || !startedAt) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [startedAt, endedAt]);

  const durationMs = startedAt ? (endedAt ? new Date(endedAt).getTime() : now) - new Date(startedAt).getTime() : 0;

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
      <Stat icon={Clock} label="Duration">
        {startedAt ? formatDuration(durationMs) : "Not started"}
      </Stat>
      <Stat icon={Users2} label="Participants">
        <AnimatedCounter value={participants} />
      </Stat>
      <Stat icon={ListChecks} label="Recommendations">
        <AnimatedCounter value={recommendationsCount} />
      </Stat>
      <Stat icon={Gavel} label="Decisions made">
        <AnimatedCounter value={decisionsMade} />
      </Stat>
      <Stat icon={ShieldAlert} label="Pending approvals">
        <AnimatedCounter value={pendingApprovals} />
      </Stat>
      <Stat icon={Gauge} label="Health score">
        {overallHealthScore != null ? `${overallHealthScore}/100` : "Not computed"}
      </Stat>
    </div>
  );
}
