import type { ReactNode } from "react";
import { FileText, AlertTriangle, Lightbulb, ArrowRight, ListChecks, OctagonAlert } from "lucide-react";
import type { MeetingActionItem, MeetingBlocker } from "@/lib/ai/agent-runtime";

export interface StructuredMeetingNotes {
  summary: string;
  // A meeting summarized before this change stored plain narrative
  // sentences here; every meeting since stores the structured execution
  // plan. Both shapes are rendered — see renderActionItem below.
  actionItems: Array<string | MeetingActionItem>;
  risks: string[];
  // Optional: absent on any notesJson written before blocker detection
  // existed — never backfilled, just treated as "none reported."
  blockers?: MeetingBlocker[];
  recommendations: string[];
  nextSteps: string[];
}

function NoteSection<T>({
  icon: Icon,
  title,
  items,
  renderItem,
}: {
  icon: typeof FileText;
  title: string;
  items: T[];
  renderItem?: (item: T, index: number) => ReactNode;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" /> {title}
      </h4>
      <ul className="flex flex-col gap-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-foreground/90">
            <span className="mt-2 size-1 shrink-0 rounded-full bg-primary" />
            {renderItem ? renderItem(item, i) : <span>{String(item)}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function renderBlocker(item: MeetingBlocker) {
  return (
    <span className="flex flex-col gap-0.5">
      <span>{item.description}</span>
      <span className="text-muted-foreground">Proposed solution: {item.proposedSolution}</span>
    </span>
  );
}

/** Plain read-only render for a caller that doesn't pass renderActionItem (e.g. the Delivery Board, which has no promotion flow of its own). */
function defaultActionItemRender(item: string | MeetingActionItem) {
  if (typeof item === "string") return <span>{item}</span>;
  return (
    <span className="flex flex-col gap-0.5">
      <span className="font-medium text-foreground">{item.title}</span>
      <span className="text-xs text-muted-foreground">
        Owner: {item.owner} · Priority: {item.priority} · Due in {item.dueInDays}d · KPI: {item.kpi}
      </span>
    </span>
  );
}

/**
 * Real, structured end-of-meeting record — six independently-rendered
 * sections from runMeetingNotesTurn's genuine Claude output, never a single
 * fabricated paragraph. `renderActionItem` lets a caller (the War Room page)
 * render each item — legacy narrative string or structured execution-plan
 * item — with its own tracking/promotion control; callers that don't need
 * that (e.g. the Delivery Board) fall back to a plain read-only render.
 */
export function MeetingNotes({
  notes,
  renderActionItem,
}: {
  notes: StructuredMeetingNotes;
  renderActionItem?: (item: string | MeetingActionItem, index: number) => ReactNode;
}) {
  return (
    <div className="glass-panel-strong flex flex-col gap-5 rounded-2xl border border-primary/20 p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-primary">
        <FileText className="size-4" /> Meeting Notes
      </h2>
      <p className="whitespace-pre-wrap text-sm text-foreground/90">{notes.summary}</p>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <NoteSection
          icon={ListChecks}
          title="Action items"
          items={notes.actionItems}
          renderItem={renderActionItem ?? defaultActionItemRender}
        />
        <NoteSection icon={AlertTriangle} title="Risks" items={notes.risks} />
        <NoteSection icon={OctagonAlert} title="Blockers" items={notes.blockers ?? []} renderItem={renderBlocker} />
        <NoteSection icon={Lightbulb} title="Recommendations" items={notes.recommendations} />
        <NoteSection icon={ArrowRight} title="Next steps" items={notes.nextSteps} />
      </div>
    </div>
  );
}
