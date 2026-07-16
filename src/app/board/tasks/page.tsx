import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Container } from "@/components/ui/container";
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EXECUTIVE_AGENT_TYPES } from "@/lib/ai/personas";

import { CreateTaskForm } from "./_components/create-task-form";
import { TaskCard, type BoardTask } from "./_components/task-card";

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "RUNNING", label: "Running" },
  { value: "BLOCKED", label: "Blocked" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;

export default async function TasksPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=%2Fboard%2Ftasks");
  }
  const userId = session.user.id;

  const membership = await prisma.membership.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    include: { organization: true },
  });
  if (!membership) {
    redirect("/onboarding");
  }
  const organizationId = membership.organizationId;
  const canManage = membership.role === "OWNER" || membership.role === "ADMIN";

  const [tasks, agents, memberships] = await Promise.all([
    prisma.task.findMany({
      // Project-scoped tasks (Kanban board, sprints, milestones) live
      // exclusively under /dashboard/projects/[id]/board from Phase 14
      // onward — excluded here so they don't leak into this AI-agent task
      // inbox (which also hardcodes the 5 original TaskStatus values above,
      // none of which the Project Kanban's new statuses would ever match).
      where: { organizationId, projectId: null },
      orderBy: { createdAt: "desc" },
      include: {
        assignedToAgent: { select: { id: true, name: true } },
        assignedToUser: { select: { id: true, name: true } },
        assignedByUser: { select: { name: true } },
        assignedByAgent: { select: { name: true } },
      },
    }),
    prisma.aIAgentInstance.findMany({
      where: { organizationId, active: true, type: { in: EXECUTIVE_AGENT_TYPES } },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.membership.findMany({
      where: { organizationId, status: "ACTIVE" },
      select: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const boardTasks: BoardTask[] = tasks.map((task) => ({
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    result: task.result,
    dueDate: task.dueDate ? task.dueDate.toISOString() : null,
    createdAt: task.createdAt.toISOString(),
    assignedToAgent: task.assignedToAgent,
    assignedToUser: task.assignedToUser,
    assignedByUser: task.assignedByUser,
    assignedByAgent: task.assignedByAgent,
  }));

  const users = memberships.map((m) => m.user);

  return (
    <main className="min-h-svh bg-background py-12">
      <Container className="flex flex-col gap-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Tasks</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Work assigned to your AI executive agents and your team — including real, agent-delivered results.
            </p>
          </div>
          {canManage ? <CreateTaskForm agents={agents} users={users} /> : null}
        </div>

        <Tabs defaultValue="all">
          <TabsList className="flex-wrap">
            {STATUS_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
                {tab.value !== "all" && (
                  <span className="ml-1.5 text-xs opacity-70">
                    {boardTasks.filter((t) => t.status === tab.value).length}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {STATUS_TABS.map((tab) => {
            const filtered = tab.value === "all" ? boardTasks : boardTasks.filter((t) => t.status === tab.value);
            return (
              <TabsContent key={tab.value} value={tab.value}>
                {filtered.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
                      <CardTitle>No tasks here</CardTitle>
                      <CardDescription>
                        {canManage ? "Assign a task to get your AI workforce moving." : "Nothing has been assigned yet."}
                      </CardDescription>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="flex flex-col gap-4">
                    {filtered.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        canManage={canManage}
                        isAssignee={task.assignedToUser?.id === userId}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      </Container>
    </main>
  );
}
