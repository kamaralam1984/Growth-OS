import { notFound } from "next/navigation";

import { Container } from "@/components/ui/container";
import { prisma } from "@/lib/prisma";
import { requireActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { TimerWidget } from "./_components/timer-widget";
import { ManualEntryForm } from "./_components/manual-entry-form";
import { TimesheetList, type TimeEntryRow } from "./_components/timesheet-list";

export default async function ProjectTimePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { membership, userId } = await requireActiveMembership(`/dashboard/projects/${id}/time`);

  const project = await prisma.project.findUnique({ where: { id }, select: { id: true, name: true, organizationId: true } });
  if (!project || project.organizationId !== membership.organizationId) notFound();

  const [tasks, entries, runningEntry] = await Promise.all([
    prisma.task.findMany({ where: { projectId: id }, orderBy: { createdAt: "desc" }, select: { id: true, title: true } }),
    prisma.timeEntry.findMany({
      where: { projectId: id },
      orderBy: { startedAt: "desc" },
      take: 100,
      include: { user: { select: { name: true, email: true } }, task: { select: { title: true } } },
    }),
    prisma.timeEntry.findFirst({ where: { projectId: id, userId, endedAt: null } }),
  ]);

  const rows: TimeEntryRow[] = entries.map((e) => ({
    id: e.id,
    userName: e.user.name ?? e.user.email ?? "Team member",
    taskTitle: e.task?.title ?? null,
    startedAt: e.startedAt.toISOString(),
    endedAt: e.endedAt ? e.endedAt.toISOString() : null,
    durationMinutes: e.durationMinutes,
    billable: e.billable,
    source: e.source,
    note: e.note,
    canDelete: e.userId === userId,
  }));

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{project.name} — Time Tracking</h1>
          <p className="text-sm text-muted-foreground">Real start/stop timers and manual entries — billable totals feed budget-burn health directly.</p>
        </div>

        <TimerWidget
          projectId={id}
          runningEntry={
            runningEntry
              ? { id: runningEntry.id, startedAt: runningEntry.startedAt.toISOString(), taskId: runningEntry.taskId, note: runningEntry.note, source: runningEntry.source }
              : null
          }
          tasks={tasks}
        />

        <div className="flex justify-end">
          <ManualEntryForm projectId={id} tasks={tasks} />
        </div>

        <TimesheetList entries={rows} />
      </Container>
    </main>
  );
}
