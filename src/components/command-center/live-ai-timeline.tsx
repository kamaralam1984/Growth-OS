import { Bot } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/utils";

export interface LiveAITimelineItem {
  id: string;
  description: string;
  actorName: string | null;
  createdAt: Date;
}

/**
 * Real-time feed of Activity rows attributed to an AI agent (actorAgentId
 * set) — the "what has the AI workforce actually done" timeline, distinct
 * from the org-wide <ActivityBar> (which also includes human/system events).
 */
export function LiveAITimeline({ items }: { items: LiveAITimelineItem[] }) {
  return (
    <Card glass>
      <CardHeader>
        <CardTitle className="text-base">Live AI Timeline</CardTitle>
        <CardDescription>What your agents have done recently.</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No AI activity yet.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {items.map((item) => (
              <li key={item.id} className="flex gap-2.5 text-sm">
                <Bot className="mt-0.5 size-3.5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-foreground">
                    {item.actorName && <span className="font-medium">{item.actorName}: </span>}
                    {item.description}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatRelativeTime(item.createdAt)}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
