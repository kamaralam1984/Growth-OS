import type { ComponentType } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Bot,
  Calendar,
  CheckCircle2,
  MessageSquare,
  ListChecks,
  Bell,
  Zap,
  Users as UsersIcon,
  ArrowRight,
} from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { formatRelativeTime } from "@/lib/utils";
import { EXECUTIVE_AGENT_TYPES } from "@/lib/ai/personas";
import type {
  ActivityType,
  DecisionStatus,
  MeetingStatus,
} from "@/generated/prisma/client";

import { AgentCard, type BoardAgent } from "./_components/agent-card";

/** Monday-start "this week" boundary, used for the meetings-this-week stat. */
function startOfWeek(now: Date): Date {
  const date = new Date(now);
  const day = date.getDay(); // 0 = Sunday
  const diffToMonday = (day + 6) % 7;
  date.setDate(date.getDate() - diffToMonday);
  date.setHours(0, 0, 0, 0);
  return date;
}

const ACTIVITY_ICONS: Record<ActivityType, ComponentType<{ className?: string }>> = {
  MEETING: UsersIcon,
  AGENT_MESSAGE: MessageSquare,
  TASK_UPDATE: ListChecks,
  COMPLETED_WORK: CheckCircle2,
  NOTIFICATION: Bell,
  SYSTEM_EVENT: Zap,
};

const DECISION_BADGE: Record<DecisionStatus, { variant: "default" | "secondary" | "outline" | "accent"; className?: string }> = {
  PENDING: { variant: "outline" },
  APPROVED: { variant: "default" },
  REJECTED: { variant: "outline", className: "border-destructive/40 text-destructive" },
  ESCALATED: { variant: "accent" },
  DELAYED: { variant: "secondary" },
  DELEGATED: { variant: "secondary" },
};

const MEETING_BADGE: Record<MeetingStatus, { variant: "default" | "secondary" | "outline" | "accent"; className?: string }> = {
  SCHEDULED: { variant: "outline" },
  LIVE: { variant: "accent" },
  PAUSED: { variant: "secondary" },
  COMPLETED: { variant: "secondary" },
  CANCELLED: { variant: "outline", className: "border-destructive/40 text-destructive" },
};

export default async function BoardPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    redirect("/login?callbackUrl=%2Fboard");
  }

  const membership = await prisma.membership.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    include: { organization: true },
  });

  if (!membership) {
    redirect("/onboarding");
  }

  const organizationId = membership.organizationId;
  const weekStart = startOfWeek(new Date());

  const [agentsRaw, meetingsThisWeekCount, tasksCompletedCount, pendingDecisionsCount, activities, decisions, meetings] =
    await Promise.all([
      prisma.aIAgentInstance.findMany({
        where: { organizationId, type: { in: EXECUTIVE_AGENT_TYPES } },
      }),
      prisma.meeting.count({ where: { organizationId, createdAt: { gte: weekStart } } }),
      prisma.task.count({ where: { organizationId, status: "COMPLETED" } }),
      prisma.decision.count({ where: { organizationId, status: "PENDING" } }),
      prisma.activity.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { actorAgent: true, actorUser: true },
      }),
      prisma.decision.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.meeting.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

  const agents: BoardAgent[] = EXECUTIVE_AGENT_TYPES.map((type) => agentsRaw.find((a) => a.type === type)).filter(
    (a): a is (typeof agentsRaw)[number] => Boolean(a),
  );

  const activeAgentsCount = agents.filter((a) => a.active).length;
  const hasFullBoard = agents.length === EXECUTIVE_AGENT_TYPES.length;
  const maxCompletedTasks = Math.max(1, ...agents.map((a) => a.completedTasksCount));

  return (
    <main className="min-h-svh bg-background py-12">
      <Container className="flex flex-col gap-10">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Executive Board</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {membership.organization.name}&rsquo;s AI executive board — live status, decisions, and work in progress.
          </p>
        </div>

        {/* Executive overview */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { label: "Active agents", value: activeAgentsCount },
            { label: "Meetings this week", value: meetingsThisWeekCount },
            { label: "Tasks completed", value: tasksCompletedCount },
            { label: "Pending decisions", value: pendingDecisionsCount },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="p-6">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{stat.label}</p>
                <AnimatedCounter value={stat.value} className="mt-2 block text-3xl font-semibold tracking-tight text-foreground" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Agent cards */}
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">AI Executive Agents</h2>
          {!hasFullBoard ? (
            <Card glass>
              <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
                <Bot className="size-8 text-muted-foreground" strokeWidth={1.5} />
                <p className="text-sm text-muted-foreground">
                  Your AI executive board hasn&rsquo;t been provisioned yet. Finish onboarding to activate the CEO,
                  Sales, Marketing, Proposal, and Outreach agents.
                </p>
                <Link
                  href="/onboarding"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  Go to onboarding
                  <ArrowRight className="size-4" />
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {agents.map((agent) => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
            </div>
          )}
        </section>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          {/* Activity feed */}
          <section className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">AI Timeline</h2>
            <Card>
              <CardContent className="flex flex-col divide-y divide-border p-0">
                {activities.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">No activity yet.</p>
                ) : (
                  activities.map((activity) => {
                    const Icon = ACTIVITY_ICONS[activity.type];
                    const actorName = activity.actorAgent?.name ?? activity.actorUser?.name ?? null;
                    return (
                      <div key={activity.id} className="flex items-start gap-3 p-4">
                        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Icon className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-foreground">
                            {actorName && <span className="font-medium">{actorName}: </span>}
                            {activity.description}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {formatRelativeTime(activity.createdAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </section>

          {/* Recent decisions */}
          <section className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Recent Decisions</h2>
            <Card>
              <CardContent className="flex flex-col divide-y divide-border p-0">
                {decisions.length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">No decisions yet.</p>
                ) : (
                  decisions.map((decision) => {
                    const badge = DECISION_BADGE[decision.status];
                    return (
                      <div key={decision.id} className="flex items-start justify-between gap-3 p-4">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">{decision.topic}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {formatRelativeTime(decision.createdAt)}
                          </p>
                        </div>
                        <Badge variant={badge.variant} className={badge.className}>
                          {decision.status}
                        </Badge>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </section>
        </div>

        {/* Meetings */}
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Meetings</h2>
          <Card>
            <CardContent className="flex flex-col divide-y divide-border p-0">
              {meetings.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">No meetings yet.</p>
              ) : (
                meetings.map((meeting) => {
                  const badge = MEETING_BADGE[meeting.status];
                  return (
                    <Link
                      key={meeting.id}
                      href={`/board/meetings/${meeting.id}`}
                      className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-accent/40"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Calendar className="size-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{meeting.title}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {formatRelativeTime(meeting.createdAt)}
                          </p>
                        </div>
                      </div>
                      <Badge variant={badge.variant} className={badge.className}>
                        {meeting.status}
                      </Badge>
                    </Link>
                  );
                })
              )}
            </CardContent>
          </Card>
        </section>

        {/* Productivity metrics */}
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Productivity Metrics</h2>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Tasks completed per agent</CardTitle>
              <CardDescription>Real counts from AIAgentInstance.completedTasksCount.</CardDescription>
            </CardHeader>
            <CardContent>
              {!hasFullBoard ? (
                <p className="text-sm text-muted-foreground">No agents yet.</p>
              ) : (
                <div className="flex h-40 items-end justify-between gap-3 sm:gap-6">
                  {agents.map((agent) => {
                    const pct = Math.round((agent.completedTasksCount / maxCompletedTasks) * 100);
                    return (
                      <div key={agent.id} className="flex flex-1 flex-col items-center gap-2">
                        <div className="flex h-32 w-full items-end overflow-hidden rounded-md bg-muted">
                          <div
                            className="w-full rounded-md bg-primary transition-[height]"
                            style={{ height: `${Math.max(pct, agent.completedTasksCount > 0 ? 6 : 0)}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-foreground">{agent.completedTasksCount}</span>
                        <span className="text-[11px] text-muted-foreground">{agent.type}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </Container>
    </main>
  );
}
