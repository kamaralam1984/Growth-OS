import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Container } from "@/components/ui/container";
import { prisma } from "@/lib/prisma";
import { requireActiveMembership } from "../../_lib/require-membership";
import { getCalendarEvents, type CalendarEventKind } from "../_lib/calendar";
import { ReminderForm } from "../_components/reminder-form";

const KIND_CLASS: Record<CalendarEventKind, string> = {
  meeting: "bg-purple-500/15 text-purple-500",
  outreachMeeting: "bg-blue-500/15 text-blue-500",
  task: "bg-amber-500/15 text-amber-500",
  reminder: "bg-emerald-500/15 text-emerald-500",
  milestone: "bg-rose-500/15 text-rose-500",
};

const KIND_LABEL: Record<CalendarEventKind, string> = {
  meeting: "AI Meeting",
  outreachMeeting: "Meeting",
  task: "Task due",
  reminder: "Reminder",
  milestone: "Milestone",
};

function startOfMonth(year: number, month: number): Date {
  return new Date(year, month, 1);
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export default async function CrmCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; projectId?: string }>;
}) {
  const { membership } = await requireActiveMembership("/dashboard/crm/calendar");
  const params = await searchParams;

  const now = new Date();
  const year = params.year ? Number(params.year) : now.getFullYear();
  const month = params.month ? Number(params.month) - 1 : now.getMonth();

  const rangeStart = startOfMonth(year, month);
  const rangeEnd = startOfMonth(year, month + 1);

  const scopedProject = params.projectId
    ? await prisma.project.findUnique({ where: { id: params.projectId }, select: { id: true, name: true, organizationId: true } })
    : null;
  const projectId = scopedProject && scopedProject.organizationId === membership.organizationId ? scopedProject.id : undefined;
  const projectQuery = projectId ? `&projectId=${projectId}` : "";

  const events = await getCalendarEvents(membership.organizationId, rangeStart, rangeEnd, { projectId });
  const eventsByDay = new Map<string, typeof events>();
  for (const event of events) {
    const key = dateKey(event.date);
    const bucket = eventsByDay.get(key);
    if (bucket) bucket.push(event);
    else eventsByDay.set(key, [event]);
  }

  const firstWeekday = rangeStart.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<Date | null> = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMonth = month === 0 ? { year: year - 1, month: 12 } : { year, month };
  const nextMonth = month === 11 ? { year: year + 1, month: 1 } : { year, month: month + 2 };
  const monthLabel = rangeStart.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{scopedProject ? `${scopedProject.name} — Calendar` : "Calendar"}</h1>
            <p className="text-sm text-muted-foreground">
              {scopedProject
                ? "This project's task due dates and milestones."
                : "AI Executive Board meetings, prospect meetings, task due dates, milestones, and reminders — all in one view."}
            </p>
          </div>
          {!scopedProject && <ReminderForm />}
        </div>

        <div className="flex items-center justify-between">
          <Link
            href={`/dashboard/crm/calendar?year=${prevMonth.year}&month=${prevMonth.month}${projectQuery}`}
            className="flex size-9 items-center justify-center rounded-lg border border-border text-foreground hover:bg-accent"
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" />
          </Link>
          <h2 className="text-lg font-semibold text-foreground">{monthLabel}</h2>
          <Link
            href={`/dashboard/crm/calendar?year=${nextMonth.year}&month=${nextMonth.month}${projectQuery}`}
            className="flex size-9 items-center justify-center rounded-lg border border-border text-foreground hover:bg-accent"
            aria-label="Next month"
          >
            <ChevronRight className="size-4" />
          </Link>
        </div>

        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-border bg-border">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="bg-muted/40 p-2 text-center text-xs font-medium text-muted-foreground">
              {d}
            </div>
          ))}
          {cells.map((day, i) => {
            const dayEvents = day ? (eventsByDay.get(dateKey(day)) ?? []) : [];
            const isToday = day && dateKey(day) === dateKey(now);
            return (
              <div key={i} className="min-h-28 bg-background p-1.5">
                {day && (
                  <>
                    <p className={`mb-1 text-xs font-medium ${isToday ? "text-primary" : "text-muted-foreground"}`}>{day.getDate()}</p>
                    <div className="flex flex-col gap-1">
                      {dayEvents.slice(0, 3).map((event) => (
                        <Link
                          key={`${event.kind}-${event.id}`}
                          href={event.href}
                          className={`truncate rounded px-1.5 py-0.5 text-[10px] font-medium ${KIND_CLASS[event.kind]}`}
                          title={`${KIND_LABEL[event.kind]}: ${event.title}`}
                        >
                          {event.title}
                        </Link>
                      ))}
                      {dayEvents.length > 3 && <p className="text-[10px] text-muted-foreground">+{dayEvents.length - 3} more</p>}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {(Object.keys(KIND_LABEL) as CalendarEventKind[]).map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className={`size-2.5 rounded-full ${KIND_CLASS[k]}`} />
              {KIND_LABEL[k]}
            </span>
          ))}
        </div>
      </Container>
    </main>
  );
}
