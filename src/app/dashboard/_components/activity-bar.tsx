import type { ComponentType } from "react";
import Link from "next/link";
import { MessageSquare, ListChecks, CheckCircle2, Bell, Zap, Users as UsersIcon } from "lucide-react";

import { formatRelativeTime } from "@/lib/utils";
import type { ActivityType } from "@/generated/prisma/client";

const ACTIVITY_ICONS: Record<ActivityType, ComponentType<{ className?: string }>> = {
  MEETING: UsersIcon,
  AGENT_MESSAGE: MessageSquare,
  TASK_UPDATE: ListChecks,
  COMPLETED_WORK: CheckCircle2,
  NOTIFICATION: Bell,
  SYSTEM_EVENT: Zap,
};

export interface ActivityBarItem {
  id: string;
  type: ActivityType;
  description: string;
  actorName: string | null;
  createdAt: Date;
}

/** Slim, always-visible strip of the most recent real Activity rows — sits fixed at the bottom of every /dashboard/* page. */
export function ActivityBar({ items }: { items: ActivityBarItem[] }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur">
      <div className="flex h-11 items-center gap-4 overflow-x-auto px-4 sm:px-6">
        <Link
          href="/board/activity"
          className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
        >
          Activity
        </Link>
        {items.length === 0 ? (
          <span className="text-xs text-muted-foreground">No activity yet.</span>
        ) : (
          items.map((item) => {
            const Icon = ACTIVITY_ICONS[item.type];
            return (
              <span key={item.id} className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                <Icon className="size-3.5 shrink-0 text-primary" />
                <span className="max-w-64 truncate text-foreground">
                  {item.actorName && <span className="font-medium">{item.actorName}: </span>}
                  {item.description}
                </span>
                <span className="shrink-0">· {formatRelativeTime(item.createdAt)}</span>
              </span>
            );
          })
        )}
      </div>
    </div>
  );
}
