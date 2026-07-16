"use client";

import { useEffect, useState } from "react";
import { Clock, Users2, ListChecks, Gavel, ShieldAlert, DollarSign } from "lucide-react";

import { AnimatedCounter } from "@/components/ui/animated-counter";

export interface LiveStatsStripProps {
  startedAt: string | null;
  endedAt: string | null;
  participants: number;
  tasksCreated: number;
  decisionsMade: number;
  pendingApprovals: number;
  revenueOpportunity: number | null;
  currency?: string | null;
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

/** The War Room's live dashboard strip — duration ticks client-side; every other number is a real Prisma count/sum re-rendered on each server refresh (SSE-driven, see realtime-toast.tsx). */
export function LiveStatsStrip({
  startedAt,
  endedAt,
  participants,
  tasksCreated,
  decisionsMade,
  pendingApprovals,
  revenueOpportunity,
  currency,
}: LiveStatsStripProps) {
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
      <Stat icon={ListChecks} label="Tasks created">
        <AnimatedCounter value={tasksCreated} />
      </Stat>
      <Stat icon={Gavel} label="Decisions made">
        <AnimatedCounter value={decisionsMade} />
      </Stat>
      <Stat icon={ShieldAlert} label="Pending approvals">
        <AnimatedCounter value={pendingApprovals} />
      </Stat>
      <Stat icon={DollarSign} label="Revenue opportunity">
        {revenueOpportunity != null
          ? new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD", maximumFractionDigits: 0 }).format(
              revenueOpportunity,
            )
          : "Not linked"}
      </Stat>
    </div>
  );
}
