import { notFound } from "next/navigation";

import { Container } from "@/components/ui/container";
import { prisma } from "@/lib/prisma";
import { requireActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { computeSprintBurndown } from "@/lib/projects/burndown";
import { SprintBoard, type SprintRow } from "./_components/sprint-board";

export default async function ProjectSprintsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { membership } = await requireActiveMembership(`/dashboard/projects/${id}/sprints`);
  const canManage = membership.role === "OWNER" || membership.role === "ADMIN";

  const project = await prisma.project.findUnique({ where: { id }, select: { id: true, name: true, organizationId: true } });
  if (!project || project.organizationId !== membership.organizationId) notFound();

  const [sprints, unassignedTasks] = await Promise.all([
    prisma.sprint.findMany({
      where: { projectId: id },
      orderBy: { startDate: "desc" },
      include: { tasks: { select: { id: true, title: true, status: true } } },
    }),
    prisma.task.findMany({ where: { projectId: id, sprintId: null }, orderBy: { createdAt: "desc" }, select: { id: true, title: true } }),
  ]);

  const rows: SprintRow[] = await Promise.all(
    sprints.map(async (sprint) => {
      const burndown = sprint.status === "PLANNING" ? null : await computeSprintBurndown(sprint.id);
      return {
        id: sprint.id,
        name: sprint.name,
        goal: sprint.goal,
        startDate: sprint.startDate.toISOString(),
        endDate: sprint.endDate.toISOString(),
        capacityHours: sprint.capacityHours,
        status: sprint.status,
        tasks: sprint.tasks,
        burndown: burndown ? { points: burndown.points, velocityHours: burndown.velocityHours } : null,
      };
    }),
  );

  return (
    <main className="py-8">
      <Container className="flex max-w-4xl flex-col gap-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{project.name} — Sprints</h1>
          <p className="text-sm text-muted-foreground">Real burndown from logged task-status history — ideal line is linear, actual line stops at today.</p>
        </div>
        <SprintBoard projectId={id} sprints={rows} unassignedTasks={unassignedTasks} canManage={canManage} />
      </Container>
    </main>
  );
}
