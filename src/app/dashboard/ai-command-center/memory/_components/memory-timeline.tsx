"use client";

import { Badge } from "@/components/ui/badge";
import type { TimelineRow } from "./memory-manager";

const EVENT_LABEL: Record<TimelineRow["eventType"], string> = {
  CREATED: "created",
  EDITED: "edited",
  PINNED: "pinned",
  UNPINNED: "unpinned",
  ARCHIVED: "archived",
  RESTORED: "restored",
  DELETED: "deleted",
};

const EVENT_VARIANT: Record<TimelineRow["eventType"], "default" | "secondary" | "outline" | "accent"> = {
  CREATED: "accent",
  EDITED: "outline",
  PINNED: "accent",
  UNPINNED: "outline",
  ARCHIVED: "secondary",
  RESTORED: "outline",
  DELETED: "secondary",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * Real AgentMemoryEvent rows, newest first — a genuine audit trail, never
 * reconstructed after the fact. `memoryId: null` rows are DELETED events
 * whose AgentMemory row is gone (onDelete: SetNull); their contentSnapshot
 * is the only surviving record of what was deleted, which is why this view
 * shows it even though the live memory list never displays snapshots.
 */
export function MemoryTimeline({ events }: { events: TimelineRow[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No memory events yet.</p>;
  }

  return (
    <ol className="flex flex-col gap-3">
      {events.map((e) => (
        <li key={e.id} className="flex flex-col gap-1 rounded-xl border border-border bg-card/40 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={EVENT_VARIANT[e.eventType]}>{EVENT_LABEL[e.eventType]}</Badge>
            <span className="text-sm font-medium text-foreground">{e.agentName}</span>
            {e.memoryId === null && <span className="text-xs text-muted-foreground">(memory since deleted)</span>}
            <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(e.createdAt)}</span>
          </div>
          {e.contentSnapshot && (
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {e.eventType === "EDITED" ? "Previous content: " : ""}
              {e.contentSnapshot}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
