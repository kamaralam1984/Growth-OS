import { PlayCircle, MessageSquare, Gavel, CheckCircle2, ListPlus, StopCircle } from "lucide-react";

export type TimelineKind = "started" | "message" | "decision_proposed" | "decision_finalized" | "vote" | "task_created" | "ended";

export interface TimelineEntry {
  id: string;
  kind: TimelineKind;
  label: string;
  detail?: string;
  timestamp: string;
}

const KIND_ICON: Record<TimelineKind, typeof PlayCircle> = {
  started: PlayCircle,
  message: MessageSquare,
  decision_proposed: Gavel,
  decision_finalized: CheckCircle2,
  vote: CheckCircle2,
  task_created: ListPlus,
  ended: StopCircle,
};

/** Real chronological merge of every timestamped meeting event — no separate Timeline model, derived directly from Meeting/MeetingMessage/Decision/DecisionVote/Task rows. */
export function WarRoomTimeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Nothing has happened yet.</p>;
  }

  return (
    <ol className="flex flex-col gap-0.5">
      {entries.map((entry, i) => {
        const Icon = KIND_ICON[entry.kind];
        return (
          <li key={entry.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="size-3.5" />
              </span>
              {i < entries.length - 1 && <span className="w-px flex-1 bg-border" />}
            </div>
            <div className="min-w-0 flex-1 pb-4">
              <p className="text-sm text-foreground">{entry.label}</p>
              {entry.detail && <p className="mt-0.5 truncate text-xs text-muted-foreground">{entry.detail}</p>}
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
