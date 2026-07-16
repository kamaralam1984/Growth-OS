"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { deleteTimeEntry } from "../actions";

export interface TimeEntryRow {
  id: string;
  userName: string;
  taskTitle: string | null;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  billable: boolean;
  source: string;
  note: string | null;
  canDelete: boolean;
}

function formatHours(minutes: number | null): string {
  if (minutes == null) return "—";
  return `${(minutes / 60).toFixed(2)}h`;
}

const SOURCE_LABEL: Record<string, string> = {
  MANUAL: "Manual",
  TIMER: "Timer",
  AUTO: "Auto-resumed",
  IDLE: "Idle (unresolved)",
};

/** AUTO/IDLE are machine-generated, not hand-entered — flagged, not styled as if they were a manually-clicked Timer entry. */
function sourceBadgeVariant(source: string): "accent" | "outline" {
  return source === "AUTO" || source === "IDLE" ? "outline" : "accent";
}

export function TimesheetList({ entries }: { entries: TimeEntryRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteTimeEntry(id);
      router.refresh();
    });
  }

  const totalMinutes = entries.reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);
  const billableMinutes = entries.filter((e) => e.billable).reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);

  return (
    <Card>
      <CardContent className="flex flex-col p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <p className="text-sm font-medium text-foreground">Timesheet</p>
          <p className="text-xs text-muted-foreground">
            {formatHours(totalMinutes)} logged · {formatHours(billableMinutes)} billable
          </p>
        </div>
        {entries.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No time logged yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {entries.map((entry) => (
              <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="text-sm text-foreground">
                    {entry.userName}
                    {entry.taskTitle && <span className="text-muted-foreground"> · {entry.taskTitle}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(entry.startedAt).toLocaleString()}
                    {entry.endedAt ? ` – ${new Date(entry.endedAt).toLocaleTimeString()}` : " · running"}
                    {entry.note ? ` · ${entry.note}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!entry.billable && <Badge variant="outline">Non-billable</Badge>}
                  <Badge
                    variant={sourceBadgeVariant(entry.source)}
                    className={entry.source === "IDLE" ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400" : undefined}
                  >
                    {SOURCE_LABEL[entry.source] ?? entry.source}
                  </Badge>
                  <span className="text-sm font-semibold text-foreground">{formatHours(entry.durationMinutes)}</span>
                  {entry.canDelete && (
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(entry.id)} disabled={pending} aria-label="Delete entry">
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
