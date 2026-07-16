import { notFound } from "next/navigation";

import { Container } from "@/components/ui/container";
import { prisma } from "@/lib/prisma";
import { requireActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { CreateProjectTaskForm } from "../../_components/create-task-form";
import { KanbanClient } from "./_components/kanban-client";
import type { ProjectBoardTask } from "../../_components/task-card";

export default async function ProjectBoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { membership } = await requireActiveMembership(`/dashboard/projects/${id}/board`);
  const organizationId = membership.organizationId;
  const canManage = membership.role === "OWNER" || membership.role === "ADMIN";

  const [project, tasks, members, milestones, sprints] = await Promise.all([
    prisma.project.findUnique({ where: { id }, select: { id: true, name: true, organizationId: true } }),
    prisma.task.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
      include: {
        assignedToUser: { select: { id: true, name: true } },
        milestone: { select: { id: true, name: true } },
        sprint: { select: { id: true, name: true } },
      },
    }),
    prisma.projectMember.findMany({ where: { projectId: id }, include: { user: { select: { id: true, name: true } } } }),
    prisma.milestone.findMany({ where: { projectId: id }, orderBy: { order: "asc" }, select: { id: true, name: true } }),
    prisma.sprint.findMany({ where: { projectId: id }, orderBy: { startDate: "desc" }, select: { id: true, name: true } }),
  ]);

  if (!project || project.organizationId !== organizationId) notFound();

  const boardTasks: ProjectBoardTask[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    startDate: t.startDate ? t.startDate.toISOString() : null,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    estimatedHours: t.estimatedHours,
    actualHours: t.actualHours,
    labels: t.labels,
    visibleToClient: t.visibleToClient,
    clientRaised: t.clientRaised,
    assignedToUser: t.assignedToUser,
    milestone: t.milestone,
    sprint: t.sprint,
  }));

  const memberOptions = members.map((m) => ({ userId: m.user.id, name: m.user.name }));

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{project.name} — Board</h1>
            <p className="text-sm text-muted-foreground">Drag cards between columns — every move is real and logged.</p>
          </div>
          {canManage && <CreateProjectTaskForm projectId={id} members={memberOptions} milestones={milestones} sprints={sprints} />}
        </div>

        <KanbanClient tasks={boardTasks} members={memberOptions} milestones={milestones} sprints={sprints} canManage={canManage} />
      </Container>
    </main>
  );
}
