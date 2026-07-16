import { Sparkles, DollarSign, Globe, Megaphone, UserPlus, TrendingUp, FileSearch, Activity } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CompanyTimelineEventType, TimelineEventSource } from "@/generated/prisma/client";

const TYPE_ICON: Record<CompanyTimelineEventType, typeof Sparkles> = {
  CREATED: Sparkles,
  FUNDING: DollarSign,
  WEBSITE_UPDATE: Globe,
  ANNOUNCEMENT: Megaphone,
  HIRING: UserPlus,
  EXPANSION: TrendingUp,
  RESEARCH_NOTE: FileSearch,
  INTERNAL_ACTIVITY: Activity,
};

const SOURCE_STYLE: Record<TimelineEventSource, { label: string; className: string }> = {
  SYSTEM: { label: "Verified", className: "border-border bg-transparent text-foreground" },
  AI_RESEARCH: { label: "AI-inferred", className: "border-primary/20 bg-primary/10 text-primary" },
  MANUAL: { label: "Manual entry", className: "border-secondary bg-secondary text-secondary-foreground" },
};

export interface CompanyTimelineEventView {
  id: string;
  type: CompanyTimelineEventType;
  title: string;
  description: string | null;
  source: TimelineEventSource;
  occurredAt: string;
}

export function CompanyTimeline({ events }: { events: CompanyTimelineEventView[] }) {
  if (events.length === 0) {
    return (
      <Card glass>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          No timeline activity yet. Generate an intelligence report or research note to start building this
          company&apos;s history.
        </CardContent>
      </Card>
    );
  }

  return (
    <ol className="flex flex-col gap-4">
      {events.map((event, index) => {
        const Icon = TYPE_ICON[event.type];
        const sourceStyle = SOURCE_STYLE[event.source];
        return (
          <li key={event.id} className="relative flex gap-3 pb-4">
            {index < events.length - 1 && (
              <span className="absolute left-[15px] top-8 h-[calc(100%-1rem)] w-px bg-border" aria-hidden />
            )}
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Icon className="size-4" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-foreground">{event.title}</p>
                <Badge variant="outline" className={cn("text-[10px]", sourceStyle.className)}>
                  {sourceStyle.label}
                </Badge>
              </div>
              {event.description && <p className="text-sm text-muted-foreground">{event.description}</p>}
              <p className="text-xs text-muted-foreground">{new Date(event.occurredAt).toLocaleString()}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
