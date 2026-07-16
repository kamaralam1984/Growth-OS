import Link from "next/link";
import { Gauge, Bug, ShieldAlert, DollarSign, Gavel, Users2, CalendarClock } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { requireActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { computeProjectHealthScore } from "@/lib/projects/health-score";
import { computeProjectSpend } from "@/lib/projects/health";
import { getCalendarEvents } from "@/app/dashboard/crm/_lib/calendar";

const OPEN_TASK_STATUSES = ["PENDING", "RUNNING", "BLOCKED", "BACKLOG", "REVIEW", "TESTING", "READY_FOR_CLIENT"] as const;

function money(value: number, currency?: string | null): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD", maximumFractionDigits: 0 }).format(value);
}

/** Org-wide Delivery Dashboard — genuinely new scope vs. /dashboard/projects's project-list-centric Owner Dashboard: health scores, cross-project decisions/meetings, QA/security rollup, revenue, delivery calendar. */
export default async function DeliveryDashboardPage() {
  const { membership } = await requireActiveMembership("/dashboard/delivery");
  const organizationId = membership.organizationId;

  const [activeProjects, org] = await Promise.all([
    prisma.project.findMany({
      where: { organizationId, status: "ACTIVE" },
      select: { id: true, name: true, budget: true },
      orderBy: { name: "asc" },
    }),
    prisma.organization.findUnique({ where: { id: organizationId }, select: { currency: true } }),
  ]);
  const projectIds = activeProjects.map((p) => p.id);
  const now = new Date();
  const in14Days = new Date(now.getTime() + 14 * 86_400_000);

  const [healthScores, spends, recentMeetings, escalatedDecisions, openBugCount, infraRiskCount, contractValueAgg, now14dEvents] = await Promise.all([
    Promise.all(activeProjects.map(async (p) => ({ projectId: p.id, name: p.name, scores: await computeProjectHealthScore(p.id) }))),
    Promise.all(activeProjects.map(async (p) => ({ projectId: p.id, spend: await computeProjectSpend(p.id) }))),
    prisma.meeting.findMany({
      where: { relatedProjectId: { in: projectIds } },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, title: true, status: true, startedAt: true, createdAt: true, relatedProjectId: true },
    }),
    prisma.decision.findMany({
      where: { organizationId, category: "PROJECT_DELIVERY", status: "ESCALATED" },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { meeting: { select: { relatedProjectId: true } } },
    }),
    prisma.task.count({ where: { organizationId, projectId: { in: projectIds }, type: "BUG", status: { in: Array.from(OPEN_TASK_STATUSES) as never[] } } }),
    prisma.projectRisk.count({ where: { organizationId, projectId: { in: projectIds }, status: "OPEN", category: { in: ["SECURITY_ISSUE", "DEPLOYMENT_RISK"] } } }),
    prisma.client.aggregate({ where: { organizationId }, _sum: { contractValue: true } }),
    getCalendarEvents(organizationId, now, in14Days),
  ]);

  const totalBudget = activeProjects.reduce((sum, p) => sum + (p.budget ?? 0), 0);
  const totalSpend = spends.reduce((sum, s) => sum + s.spend, 0);
  const projectNameById = new Map(activeProjects.map((p) => [p.id, p.name]));
  const avgHealth = healthScores.length > 0 ? Math.round(healthScores.reduce((sum, h) => sum + h.scores.overallScore, 0) / healthScores.length) : null;
  const milestoneEvents = now14dEvents.filter((e) => e.kind === "milestone");

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Delivery Dashboard</h1>
          <p className="text-sm text-muted-foreground">Cross-project rollup from every active project&apos;s real AI Delivery Board — health, decisions, QA, and revenue.</p>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="p-5">
              <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <Gauge className="size-3" /> Avg. health score
              </p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{avgHealth != null ? `${avgHealth}/100` : "—"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <Bug className="size-3" /> Open bugs
              </p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{openBugCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <ShieldAlert className="size-3" /> Security/infra risks
              </p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{infraRiskCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <DollarSign className="size-3" /> Real spend
              </p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{money(totalSpend, org?.currency)}</p>
              {totalBudget > 0 && <p className="text-xs text-muted-foreground">of {money(totalBudget, org?.currency)} budgeted</p>}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card glass>
            <CardContent className="flex flex-col gap-3 p-5">
              <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Gauge className="size-4" /> Project health
              </p>
              {healthScores.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active projects yet.</p>
              ) : (
                healthScores
                  .sort((a, b) => a.scores.overallScore - b.scores.overallScore)
                  .map((h) => (
                    <Link key={h.projectId} href={`/dashboard/projects/${h.projectId}/delivery`} className="flex items-center justify-between gap-3 border-t border-border/60 pt-3 first:border-0 first:pt-0">
                      <span className="text-sm text-foreground">{h.name}</span>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full rounded-full ${h.scores.overallScore >= 75 ? "bg-primary" : h.scores.overallScore >= 50 ? "bg-amber-500" : "bg-destructive"}`}
                            style={{ width: `${h.scores.overallScore}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-foreground">{h.scores.overallScore}</span>
                      </div>
                    </Link>
                  ))
              )}
            </CardContent>
          </Card>

          <Card glass>
            <CardContent className="flex flex-col gap-3 p-5">
              <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Gavel className="size-4" /> Decisions awaiting approval
              </p>
              {escalatedDecisions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No delivery decisions are escalated right now.</p>
              ) : (
                escalatedDecisions.map((d) => (
                  <Link
                    key={d.id}
                    href={d.meeting?.relatedProjectId ? `/dashboard/projects/${d.meeting.relatedProjectId}/delivery` : "/dashboard/delivery"}
                    className="flex items-center justify-between gap-3 border-t border-border/60 pt-3 first:border-0 first:pt-0"
                  >
                    <div>
                      <p className="text-sm text-foreground">{d.topic}</p>
                      <p className="text-xs text-muted-foreground">{d.meeting?.relatedProjectId ? projectNameById.get(d.meeting.relatedProjectId) : "Unknown project"}</p>
                    </div>
                    <Badge variant="secondary">ESCALATED</Badge>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          <Card glass>
            <CardContent className="flex flex-col gap-3 p-5">
              <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Users2 className="size-4" /> Recent Delivery Board meetings
              </p>
              {recentMeetings.length === 0 ? (
                <p className="text-sm text-muted-foreground">No Delivery Board standups have run yet.</p>
              ) : (
                recentMeetings.map((m) => (
                  <Link key={m.id} href={`/board/meetings/${m.id}`} className="flex items-center justify-between gap-3 border-t border-border/60 pt-3 first:border-0 first:pt-0">
                    <div>
                      <p className="text-sm text-foreground">{m.title}</p>
                      <p className="text-xs text-muted-foreground">{(m.startedAt ?? m.createdAt).toLocaleDateString()}</p>
                    </div>
                    <Badge variant="outline">{m.status}</Badge>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          <Card glass>
            <CardContent className="flex flex-col gap-3 p-5">
              <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <CalendarClock className="size-4" /> Delivery calendar (14 days)
              </p>
              {milestoneEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No milestones due in the next 14 days.</p>
              ) : (
                milestoneEvents.map((e) => (
                  <Link key={`${e.kind}-${e.id}`} href={e.href} className="flex items-center justify-between gap-3 border-t border-border/60 pt-3 first:border-0 first:pt-0">
                    <span className="text-sm text-foreground">{e.title}</span>
                    <span className="text-xs text-muted-foreground">{e.date.toLocaleDateString()}</span>
                  </Link>
                ))
              )}
              <Link href="/dashboard/crm/calendar" className="mt-1 text-xs text-primary hover:underline">
                View full calendar
              </Link>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="flex items-center justify-between gap-3 p-5">
            <p className="text-sm text-foreground">Total real contract value on record</p>
            <p className="text-lg font-semibold text-foreground">{money(contractValueAgg._sum.contractValue ?? 0, org?.currency)}</p>
          </CardContent>
        </Card>
      </Container>
    </main>
  );
}
