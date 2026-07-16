import { Megaphone, Mail, MessageSquare, CalendarCheck, ThumbsUp, ThumbsDown, Clock, ListChecks } from "lucide-react";

import { AnimatedCounter } from "@/components/ui/animated-counter";
import type { OutreachDashboardStats } from "@/lib/outreach/campaign-analytics";

const ITEMS: Array<{ key: keyof OutreachDashboardStats; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: "campaigns", label: "Campaigns", icon: Megaphone },
  { key: "emailsPrepared", label: "Emails prepared", icon: Mail },
  { key: "replies", label: "Replies", icon: MessageSquare },
  { key: "meetings", label: "Meetings", icon: CalendarCheck },
  { key: "interested", label: "Interested", icon: ThumbsUp },
  { key: "notInterested", label: "Not interested", icon: ThumbsDown },
  { key: "pending", label: "Pending", icon: Clock },
  { key: "tasks", label: "Tasks", icon: ListChecks },
];

export function OutreachStatsStrip({ stats }: { stats: OutreachDashboardStats }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
      {ITEMS.map(({ key, label, icon: Icon }) => (
        <div key={key} className="glass-panel flex flex-col gap-1.5 rounded-xl p-3.5">
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Icon className="size-3.5" /> {label}
          </span>
          <span className="text-xl font-semibold tracking-tight text-foreground">
            <AnimatedCounter value={stats[key]} />
          </span>
        </div>
      ))}
    </div>
  );
}
