import { prisma } from "@/lib/prisma";

export type CalendarEventKind = "meeting" | "outreachMeeting" | "task" | "reminder" | "milestone";

export interface CalendarEvent {
  id: string;
  kind: CalendarEventKind;
  title: string;
  date: Date;
  status?: string;
  href: string;
}

/**
 * Real calendar events for a date range — Meetings (AI Executive Board),
 * OutreachMeetings (prospect-facing), Task due dates, Reminders, and
 * Milestone due dates, all pulled from rows that already exist for other
 * features (nothing here is a calendar-specific duplicate model). Meeting
 * has no explicit "scheduledAt" field (it's an agentic meeting that starts
 * immediately, not booked in advance) — startedAt is used when set, falling
 * back to createdAt, documented rather than silently wrong.
 *
 * When `projectId` is given (the Project hub's "Calendar" link), the view
 * narrows to that project's Tasks and Milestones only — Meetings,
 * OutreachMeetings, and Reminders aren't project-scoped rows, so they're
 * left out of a project-specific view rather than shown unfiltered.
 */
export async function getCalendarEvents(
  organizationId: string,
  rangeStart: Date,
  rangeEnd: Date,
  opts?: { projectId?: string },
): Promise<CalendarEvent[]> {
  const projectId = opts?.projectId;

  const [meetings, outreachMeetings, tasks, reminders, milestones] = await Promise.all([
    projectId
      ? Promise.resolve([])
      : prisma.meeting.findMany({
          where: {
            organizationId,
            OR: [
              { startedAt: { gte: rangeStart, lt: rangeEnd } },
              { startedAt: null, createdAt: { gte: rangeStart, lt: rangeEnd } },
            ],
          },
          select: { id: true, title: true, status: true, startedAt: true, createdAt: true },
        }),
    projectId
      ? Promise.resolve([])
      : prisma.outreachMeeting.findMany({
          where: { organizationId, scheduledAt: { gte: rangeStart, lt: rangeEnd } },
          select: { id: true, title: true, status: true, scheduledAt: true },
        }),
    prisma.task.findMany({
      where: { organizationId, dueDate: { gte: rangeStart, lt: rangeEnd }, ...(projectId ? { projectId } : {}) },
      select: { id: true, title: true, status: true, dueDate: true, projectId: true },
    }),
    projectId
      ? Promise.resolve([])
      : prisma.reminder.findMany({
          where: { organizationId, remindAt: { gte: rangeStart, lt: rangeEnd }, dismissed: false },
          select: { id: true, title: true, remindAt: true },
        }),
    prisma.milestone.findMany({
      where: {
        dueDate: { gte: rangeStart, lt: rangeEnd },
        project: projectId ? { id: projectId, organizationId } : { organizationId },
      },
      select: { id: true, name: true, status: true, dueDate: true, projectId: true },
    }),
  ]);

  const events: CalendarEvent[] = [
    ...meetings.map((m) => ({
      id: m.id,
      kind: "meeting" as const,
      title: m.title,
      date: m.startedAt ?? m.createdAt,
      status: m.status,
      href: `/board/meetings/${m.id}`,
    })),
    ...outreachMeetings.map((m) => ({
      id: m.id,
      kind: "outreachMeeting" as const,
      title: m.title,
      date: m.scheduledAt as Date,
      status: m.status,
      href: `/dashboard/outreach`,
    })),
    ...tasks.map((t) => ({
      id: t.id,
      kind: "task" as const,
      title: t.title,
      date: t.dueDate as Date,
      status: t.status,
      href: t.projectId ? `/dashboard/projects/${t.projectId}/board` : `/dashboard/crm/tasks`,
    })),
    ...reminders.map((r) => ({
      id: r.id,
      kind: "reminder" as const,
      title: r.title,
      date: r.remindAt,
      href: `/dashboard/crm/calendar`,
    })),
    ...milestones.map((m) => ({
      id: m.id,
      kind: "milestone" as const,
      title: m.name,
      date: m.dueDate as Date,
      status: m.status,
      href: `/dashboard/projects/${m.projectId}/milestones`,
    })),
  ];

  return events.sort((a, b) => a.date.getTime() - b.date.getTime());
}
