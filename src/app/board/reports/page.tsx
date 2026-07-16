import Link from "next/link";
import { redirect } from "next/navigation";
import { Crown, Megaphone, FileText, Send, TrendingUp, Target, DollarSign, Scale } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatRelativeTime } from "@/lib/utils";
import { getPeriodReport, getAgentProductivity, type PeriodReport, type ReportPeriod } from "@/lib/reports";
import type { AgentType, DecisionStatus, MeetingStatus } from "@/generated/prisma/client";
import { BoardReportExportMenu } from "@/app/board/reports/_components/board-report-export-menu";

const AGENT_ICONS: Partial<Record<AgentType, React.ComponentType<{ className?: string }>>> = {
  CEO: Crown,
  SALES: TrendingUp,
  MARKETING: Megaphone,
  PROPOSAL: FileText,
  OUTREACH: Send,
  FINANCE: DollarSign,
  LEGAL: Scale,
};

const MEETING_BADGE: Record<MeetingStatus, "default" | "secondary" | "outline" | "accent"> = {
  SCHEDULED: "outline",
  LIVE: "accent",
  PAUSED: "secondary",
  COMPLETED: "secondary",
  CANCELLED: "outline",
};

const DECISION_BADGE: Record<DecisionStatus, "default" | "secondary" | "outline" | "accent"> = {
  PENDING: "outline",
  APPROVED: "default",
  REJECTED: "outline",
  ESCALATED: "accent",
  DELAYED: "secondary",
  DELEGATED: "secondary",
};

const PERIOD_LABEL: Record<ReportPeriod, string> = {
  daily: "Today",
  weekly: "This week",
  monthly: "This month",
  quarterly: "This quarter",
  yearly: "This year",
};

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-6">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}

function PeriodReportPanel({ report }: { report: PeriodReport }) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {PERIOD_LABEL[report.period]} — {report.rangeStart.toLocaleString()} through {report.rangeEnd.toLocaleString()}
        </p>
        <BoardReportExportMenu period={report.period} />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Meetings held" value={report.meetingsHeld} />
        <StatCard label="Tasks completed" value={report.tasksCompleted} />
        <StatCard label="Decisions made" value={report.decisionsMade} />
        <StatCard label="Messages exchanged" value={report.messagesExchanged} />
      </div>

      <section className="flex flex-col gap-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Meeting report</h3>
        <Card>
          <CardContent className="flex flex-col divide-y divide-border p-0">
            {report.meetings.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">No meetings in this period.</p>
            ) : (
              report.meetings.map((meeting) => (
                <Link
                  key={meeting.id}
                  href={`/board/meetings/${meeting.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:bg-accent/40"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{meeting.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatRelativeTime(meeting.createdAt)} · {meeting.participantCount} participant
                      {meeting.participantCount === 1 ? "" : "s"}
                      {meeting.durationMinutes !== null && ` · ${meeting.durationMinutes} min`}
                    </p>
                  </div>
                  <Badge variant={MEETING_BADGE[meeting.status as MeetingStatus]}>{meeting.status}</Badge>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Decision report</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
          {(Object.keys(report.decisionsByStatus) as DecisionStatus[]).map((status) => (
            <Card key={status}>
              <CardContent className="p-4">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{status}</p>
                <p className="mt-1 text-xl font-semibold text-foreground">{report.decisionsByStatus[status]}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="flex flex-col divide-y divide-border p-0">
            {report.decisions.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">No decisions raised or finalized in this period.</p>
            ) : (
              report.decisions.map((decision) => (
                <div key={decision.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{decision.topic}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Raised {formatRelativeTime(decision.createdAt)}
                      {decision.finalizedAt && ` · Finalized ${formatRelativeTime(decision.finalizedAt)}`}
                    </p>
                  </div>
                  <Badge variant={DECISION_BADGE[decision.status]}>{decision.status}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

export default async function ReportsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=%2Fboard%2Freports");
  }
  const userId = session.user.id;

  const membership = await prisma.membership.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) {
    redirect("/onboarding");
  }
  const organizationId = membership.organizationId;

  const [daily, weekly, monthly, quarterly, yearly, agents] = await Promise.all([
    getPeriodReport(organizationId, "daily"),
    getPeriodReport(organizationId, "weekly"),
    getPeriodReport(organizationId, "monthly"),
    getPeriodReport(organizationId, "quarterly"),
    getPeriodReport(organizationId, "yearly"),
    getAgentProductivity(organizationId),
  ]);

  const maxCompleted = Math.max(1, ...agents.map((a) => a.completedTasksCount));

  return (
    <main className="min-h-svh bg-background py-12">
      <Container className="flex flex-col gap-10">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Real, live-queried numbers from your organization&rsquo;s meetings, tasks, decisions, and messages — no
            estimates.
          </p>
        </div>

        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">AI Productivity Report</h2>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Per-agent output</CardTitle>
              <CardDescription>
                Completed tasks (AIAgentInstance.completedTasksCount) and average confidence, updated live by the AI
                runtime — never a period filter, since these are cumulative counters.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {agents.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No agents provisioned yet — finish onboarding to activate your board.
                </p>
              ) : (
                agents.map((agent) => {
                  const Icon = AGENT_ICONS[agent.type as AgentType] ?? Target;
                  const pct = Math.round((agent.completedTasksCount / maxCompleted) * 100);
                  // confidenceScore is stored on a 0-100 scale, matching the
                  // convention already used by _components/agent-card.tsx.
                  const confidencePct =
                    agent.confidenceScore !== null ? Math.max(0, Math.min(100, Math.round(agent.confidenceScore))) : null;
                  return (
                    <div key={agent.id} className="flex flex-col gap-2 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Icon className="size-4.5" />
                        </span>
                        <div>
                          <p className="text-sm font-medium text-foreground">{agent.name}</p>
                          <p className="text-xs text-muted-foreground">{agent.active ? "Active" : "Paused"}</p>
                        </div>
                      </div>
                      <div className="flex flex-1 items-center gap-6 sm:justify-end">
                        <div className="flex flex-col gap-1">
                          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Completed tasks</span>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
                              <div className="h-full rounded-full bg-primary" style={{ width: `${agent.completedTasksCount > 0 ? Math.max(pct, 6) : 0}%` }} />
                            </div>
                            <span className="text-sm font-medium text-foreground">{agent.completedTasksCount}</span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Avg. confidence</span>
                          <span className="text-sm font-medium text-foreground">
                            {confidencePct !== null ? `${confidencePct}%` : "Not yet scored"}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </section>

        <Tabs defaultValue="daily">
          <TabsList className="flex-wrap">
            <TabsTrigger value="daily">Daily</TabsTrigger>
            <TabsTrigger value="weekly">Weekly</TabsTrigger>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
            <TabsTrigger value="quarterly">Quarterly</TabsTrigger>
            <TabsTrigger value="yearly">Yearly</TabsTrigger>
          </TabsList>
          <TabsContent value="daily">
            <PeriodReportPanel report={daily} />
          </TabsContent>
          <TabsContent value="weekly">
            <PeriodReportPanel report={weekly} />
          </TabsContent>
          <TabsContent value="monthly">
            <PeriodReportPanel report={monthly} />
          </TabsContent>
          <TabsContent value="quarterly">
            <PeriodReportPanel report={quarterly} />
          </TabsContent>
          <TabsContent value="yearly">
            <PeriodReportPanel report={yearly} />
          </TabsContent>
        </Tabs>
      </Container>
    </main>
  );
}
