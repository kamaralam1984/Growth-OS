import { Container } from "@/components/ui/container";
import { prisma } from "@/lib/prisma";
import { requireActiveMembership } from "../../_lib/require-membership";
import { TaskForm } from "../_components/task-form";
import { TaskCard, type TaskCardData } from "../_components/task-card";
import { TaskSuggestionsPanel } from "../_components/task-suggestions-panel";
import type { TaskStatus } from "@/generated/prisma/client";

const STATUS_COLUMNS: TaskStatus[] = ["PENDING", "RUNNING", "BLOCKED", "COMPLETED", "CANCELLED"];

export default async function CrmTasksPage() {
  const { membership } = await requireActiveMembership("/dashboard/crm/tasks");
  const organizationId = membership.organizationId;

  const [tasks, deals, members, allTasksForPicker] = await Promise.all([
    prisma.task.findMany({
      // Project-scoped tasks live exclusively under the Project Kanban
      // board (Phase 14) — excluded here, same discipline as the War
      // Room's task inbox, so this CRM view and its hardcoded
      // STATUS_COLUMNS (only the 5 original TaskStatus values) don't
      // silently lose or misclassify project tasks.
      where: { organizationId, parentTaskId: null, projectId: null },
      orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
      include: {
        assignedToUser: { select: { name: true, email: true } },
        deal: { select: { name: true } },
        checklistItems: { orderBy: { order: "asc" } },
        dependsOn: { select: { id: true, title: true, status: true } },
        _count: { select: { subtasks: true } },
      },
    }),
    prisma.deal.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, name: true } }),
    prisma.membership.findMany({
      where: { organizationId, status: "ACTIVE" },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.task.findMany({ where: { organizationId, projectId: null }, orderBy: { createdAt: "desc" }, take: 200, select: { id: true, title: true } }),
  ]);

  const memberOptions = members.map((m) => ({ userId: m.user.id, name: m.user.name, email: m.user.email }));

  const cardData: TaskCardData[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    status: t.status,
    type: t.type,
    priority: t.priority,
    dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
    assigneeName: t.assignedToUser?.name ?? t.assignedToUser?.email ?? null,
    dealName: t.deal?.name ?? null,
    labels: t.labels,
    isRecurring: t.isRecurring,
    checklistItems: t.checklistItems,
    dependsOn: t.dependsOn,
    subtaskCount: t._count.subtasks,
  }));

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Task Manager</h1>
            <p className="text-sm text-muted-foreground">
              Tasks, subtasks, checklists, labels, and dependencies — real Task rows shared with the AI Executive
              Board&rsquo;s own Task Board.
            </p>
          </div>
          <TaskForm deals={deals} members={memberOptions} tasks={allTasksForPicker} />
        </div>

        <TaskSuggestionsPanel />

        <div className="flex gap-4 overflow-x-auto pb-2">
          {STATUS_COLUMNS.map((status) => {
            const columnTasks = cardData.filter((t) => t.status === status);
            return (
              <div key={status} className="flex w-80 shrink-0 flex-col gap-3 rounded-2xl border border-border bg-muted/20 p-3">
                <div className="flex items-baseline justify-between px-1">
                  <h3 className="text-sm font-semibold text-foreground">{status}</h3>
                  <span className="text-xs text-muted-foreground">{columnTasks.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {columnTasks.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">No tasks.</p>
                  ) : (
                    columnTasks.map((t) => <TaskCard key={t.id} task={t} />)
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Container>
    </main>
  );
}
