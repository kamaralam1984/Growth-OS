import { Fragment } from "react";
import { notFound } from "next/navigation";

import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { requireActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { buildProjectGantt } from "@/lib/projects/gantt";

const DAY_MS = 86_400_000;

export default async function ProjectGanttPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { membership } = await requireActiveMembership(`/dashboard/projects/${id}/gantt`);

  const project = await prisma.project.findUnique({ where: { id }, select: { id: true, name: true, organizationId: true } });
  if (!project || project.organizationId !== membership.organizationId) notFound();

  const gantt = await buildProjectGantt(id);

  if (gantt.scheduled.length === 0) {
    return (
      <main className="py-8">
        <Container className="flex max-w-4xl flex-col gap-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{project.name} — Gantt</h1>
            <p className="text-sm text-muted-foreground">No scheduled tasks yet — set a start date and due date on tasks to see them here.</p>
          </div>
          {gantt.unscheduled.length > 0 && (
            <Card>
              <CardContent className="flex flex-col divide-y divide-border p-0">
                {gantt.unscheduled.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-2 p-3">
                    <span className="text-sm text-foreground">{t.title}</span>
                    <Badge variant="outline">No dates set</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </Container>
      </main>
    );
  }

  const rangeStart = gantt.rangeStart!;
  const rangeEnd = gantt.rangeEnd!;
  const totalDays = Math.max(1, Math.round((rangeEnd.getTime() - rangeStart.getTime()) / DAY_MS) + 1);
  const dayWidthPx = totalDays > 90 ? 12 : totalDays > 45 ? 18 : 28;

  function offsetDays(date: Date): number {
    return Math.round((date.getTime() - rangeStart.getTime()) / DAY_MS);
  }

  const gridTemplateColumns = `220px repeat(${totalDays}, ${dayWidthPx}px)`;

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{project.name} — Gantt</h1>
          <p className="text-sm text-muted-foreground">
            {rangeStart.toLocaleDateString()} – {rangeEnd.toLocaleDateString()} · Critical path highlighted in red (longest dependency-linked chain by real duration).
          </p>
        </div>

        <Card>
          <CardContent className="overflow-x-auto p-4">
            <div className="grid" style={{ gridTemplateColumns, gridAutoRows: "36px" }}>
              <div className="sticky left-0 z-10 bg-card" style={{ gridColumn: "1", gridRow: "1" }} />
              {Array.from({ length: totalDays }).map((_, i) => {
                const date = new Date(rangeStart.getTime() + i * DAY_MS);
                const showLabel = totalDays <= 45 || date.getDay() === 1;
                return (
                  <div
                    key={i}
                    className="border-b border-l border-border/60 text-center text-[9px] leading-[36px] text-muted-foreground"
                    style={{ gridColumn: `${i + 2}`, gridRow: "1" }}
                  >
                    {showLabel ? date.getDate() : ""}
                  </div>
                );
              })}

              {gantt.scheduled.map((task, rowIndex) => {
                const row = rowIndex + 2;
                const start = offsetDays(task.startDate);
                return (
                  <Fragment key={task.id}>
                    <div
                      key={`${task.id}-label`}
                      className="sticky left-0 z-10 flex items-center gap-1.5 truncate border-b border-border/60 bg-card pr-2 text-xs text-foreground"
                      style={{ gridColumn: "1", gridRow: `${row}` }}
                      title={task.title}
                    >
                      {task.isCriticalPath && <span className="inline-block size-1.5 shrink-0 rounded-full bg-destructive" />}
                      <span className="truncate">{task.title}</span>
                    </div>
                    <div key={`${task.id}-track`} className="border-b border-border/60" style={{ gridColumn: `2 / span ${totalDays}`, gridRow: `${row}` }} />
                    <div
                      key={`${task.id}-bar`}
                      className={`my-1.5 flex items-center rounded-md px-1.5 text-[10px] font-medium text-white ${task.isCriticalPath ? "bg-destructive" : "bg-primary"}`}
                      style={{ gridColumn: `${start + 2} / span ${task.durationDays}`, gridRow: `${row}` }}
                      title={`${task.startDate.toLocaleDateString()} – ${task.dueDate.toLocaleDateString()} (${task.durationDays}d)`}
                    >
                      <span className="truncate">{task.durationDays}d</span>
                    </div>
                  </Fragment>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {gantt.unscheduled.length > 0 && (
          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-foreground">Unscheduled tasks</h2>
            <Card>
              <CardContent className="flex flex-col divide-y divide-border p-0">
                {gantt.unscheduled.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-2 p-3">
                    <span className="text-sm text-foreground">{t.title}</span>
                    <Badge variant="outline">No dates set</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}
      </Container>
    </main>
  );
}
