import type { ReactNode } from "react";
import { FileText, AlertTriangle, Lightbulb, ArrowRight, ListChecks } from "lucide-react";

export interface StructuredMeetingNotes {
  summary: string;
  actionItems: string[];
  risks: string[];
  recommendations: string[];
  nextSteps: string[];
}

function NoteSection({
  icon: Icon,
  title,
  items,
  renderItem,
}: {
  icon: typeof FileText;
  title: string;
  items: string[];
  renderItem?: (item: string, index: number) => ReactNode;
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
            {renderItem ? renderItem(item, i) : <span>{item}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Real, structured end-of-meeting record — five independently-rendered
 * sections from runMeetingNotesTurn's genuine Claude output, never a single
 * fabricated paragraph. `renderActionItem` lets callers (the War Room page)
 * render each narrative action item with a "Track this" control instead of
 * plain text, without duplicating the section itself.
 */
export function MeetingNotes({
  notes,
  renderActionItem,
}: {
  notes: StructuredMeetingNotes;
  renderActionItem?: (item: string, index: number) => ReactNode;
}) {
  return (
    <div className="glass-panel-strong flex flex-col gap-5 rounded-2xl border border-primary/20 p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-primary">
        <FileText className="size-4" /> Meeting Notes
      </h2>
      <p className="whitespace-pre-wrap text-sm text-foreground/90">{notes.summary}</p>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <NoteSection icon={ListChecks} title="Action items" items={notes.actionItems} renderItem={renderActionItem} />
        <NoteSection icon={AlertTriangle} title="Risks" items={notes.risks} />
        <NoteSection icon={Lightbulb} title="Recommendations" items={notes.recommendations} />
        <NoteSection icon={ArrowRight} title="Next steps" items={notes.nextSteps} />
      </div>
    </div>
  );
}
