import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Container } from "@/components/ui/container";
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EXECUTIVE_AGENT_TYPES } from "@/lib/ai/personas";

import { CreateActionItemForm } from "./_components/create-action-item-form";
import { ActionItemCard, type BoardActionItem } from "./_components/action-item-card";

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "DONE", label: "Done" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;

export default async function ActionItemsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=%2Fboard%2Faction-items");
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

  const [actionItems, allAgents, memberships, projects] = await Promise.all([
    // assignedToUserId/assignedToAgentId are plain scalar columns on
    // ActionItem — unlike Task, the schema declares no back-relation to
    // User/AIAgentInstance for them, so names are resolved below via the
    // org-wide agent/member lists already being fetched here rather than
    // a Prisma `include`.
    prisma.actionItem.findMany({
      where: { organizationId },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: {
        meeting: { select: { id: true, title: true } },
        decision: { select: { id: true, topic: true, meetingId: true } },
        project: { select: { id: true, name: true } },
      },
    }),
    prisma.aIAgentInstance.findMany({
      where: { organizationId },
      select: { id: true, name: true, type: true, active: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.membership.findMany({
      where: { organizationId, status: "ACTIVE" },
      select: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.project.findMany({
      where: { organizationId },
      select: { id: true, name: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  const users = memberships.map((m) => m.user);
  const userById = new Map(users.map((u) => [u.id, u]));
  const agentById = new Map(allAgents.map((a) => [a.id, { id: a.id, name: a.name }]));
  const assignableAgents = allAgents.filter((a) => a.active && (EXECUTIVE_AGENT_TYPES as readonly string[]).includes(a.type));

  const items: BoardActionItem[] = actionItems.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    status: item.status,
    priority: item.priority,
    kpi: item.kpi,
    expectedImpact: item.expectedImpact,
    dueDate: item.dueDate ? item.dueDate.toISOString() : null,
    createdAt: item.createdAt.toISOString(),
    taskId: item.taskId,
    assignedToUser: item.assignedToUserId ? userById.get(item.assignedToUserId) ?? { id: item.assignedToUserId, name: null } : null,
    assignedToAgent: item.assignedToAgentId ? agentById.get(item.assignedToAgentId) ?? null : null,
    meeting: item.meeting,
    decision: item.decision ? { id: item.decision.id, topic: item.decision.topic, meetingId: item.decision.meetingId } : null,
    project: item.project,
  }));

  return (
    <main className="min-h-svh bg-background py-12">
      <Container className="flex flex-col gap-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Action Items</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Real, trackable follow-ups from AI Executive Board meetings and decisions — plus anything added directly.
            </p>
          </div>
          {canManage ? <CreateActionItemForm agents={assignableAgents} users={users} projects={projects} /> : null}
        </div>

        <Tabs defaultValue="all">
          <TabsList className="flex-wrap">
            {STATUS_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
                {tab.value !== "all" && (
                  <span className="ml-1.5 text-xs opacity-70">
                    {items.filter((i) => i.status === tab.value).length}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {STATUS_TABS.map((tab) => {
            const filtered = tab.value === "all" ? items : items.filter((i) => i.status === tab.value);
            return (
              <TabsContent key={tab.value} value={tab.value}>
                {filtered.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
                      <CardTitle>No action items here</CardTitle>
                      <CardDescription>
                        {canManage
                          ? "Add one directly, or track a narrative action item from a meeting summary."
                          : "Nothing has been tracked yet."}
                      </CardDescription>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="flex flex-col gap-4">
                    {filtered.map((item) => (
                      <ActionItemCard
                        key={item.id}
                        item={item}
                        canManage={canManage}
                        isAssignee={item.assignedToUser?.id === userId}
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
