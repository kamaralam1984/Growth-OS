import Link from "next/link";
import { FolderKanban, ShieldAlert, Flag, ClipboardCheck, Sparkles, Users, DollarSign } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { requireActiveMembership } from "../_lib/require-membership";
import { computeProjectSpendBatch } from "@/lib/projects/health";
import { computeResourceUtilization } from "@/lib/projects/analytics";
import { ProjectForm } from "./_components/project-form";

const STATUS_VARIANT: Record<string, "outline" | "accent" | "default" | "secondary"> = {
  PLANNING: "outline",
  ACTIVE: "accent",
  ON_HOLD: "secondary",
  COMPLETED: "default",
  CANCELLED: "outline",
};

const HEALTH_VARIANT: Record<string, "outline" | "accent" | "default" | "secondary"> = {
  ON_TRACK: "accent",
  AT_RISK: "secondary",
  OFF_TRACK: "default",
};

const OPEN_TASK_STATUSES = ["PENDING", "RUNNING", "BLOCKED", "BACKLOG", "REVIEW", "TESTING", "READY_FOR_CLIENT"] as const;

function money(value: number, currency?: string | null): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD", maximumFractionDigits: 0 }).format(value);
}

/** Owner Dashboard — the Projects hub itself becomes the rollup landing page, same "hub page becomes the dashboard" precedent as /dashboard/proposal and /board/reviews. */
export default async function ProjectsPage() {
  const { membership } = await requireActiveMembership("/dashboard/projects");
  const organizationId = membership.organizationId;
  const now = new Date();
  const in14Days = new Date(now.getTime() + 14 * 86_400_000);

  const [projects, companies, clients, criticalAlerts, upcomingDeliveries, pendingApprovalTasks, pendingApprovalMilestones, resourceUtilization, pmAgent, org] = await Promise.all([
    prisma.project.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      include: { company: { select: { name: true } }, client: { select: { name: true } }, _count: { select: { tasks: true } } },
    }),
    prisma.company.findMany({ where: { organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.client.findMany({ where: { organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.projectRisk.findMany({
      where: { organizationId, status: "OPEN", severity: { in: ["CRITICAL", "HIGH"] } },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { severity: "desc" },
      take: 8,
    }),
    prisma.milestone.findMany({
      where: { project: { organizationId }, status: { not: "COMPLETED" }, dueDate: { gte: now, lte: in14Days } },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { dueDate: "asc" },
      take: 8,
    }),
    prisma.task.findMany({
      where: { organizationId, type: "APPROVAL", projectId: { not: null }, status: { in: Array.from(OPEN_TASK_STATUSES) as never[] } },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { dueDate: "asc" },
      take: 8,
    }),
    prisma.milestone.findMany({
      where: { project: { organizationId }, status: "COMPLETED", clientApprovedAt: null, visibleToClient: true },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { completedAt: "asc" },
      take: 8,
    }),
    computeResourceUtilization(organizationId),
    prisma.aIAgentInstance.findUnique({ where: { organizationId_type: { organizationId, type: "PROJECT_MANAGER" } } }),
    prisma.organization.findUnique({ where: { id: organizationId }, select: { currency: true } }),
  ]);

  const activeProjects = projects.filter((p) => p.status === "ACTIVE");
  // Batched (2 queries total, not 2×N) — see computeProjectSpendBatch.
  const spendByProjectId = await computeProjectSpendBatch(activeProjects.map((p) => p.id));
  const totalBudget = activeProjects.reduce((sum, p) => sum + (p.budget ?? 0), 0);
  const totalSpend = activeProjects.reduce((sum, p) => sum + (spendByProjectId.get(p.id) ?? 0), 0);

  const recentAiActivity = pmAgent
    ? await prisma.activity.findMany({
        where: { organizationId, actorAgentId: pmAgent.id, type: "COMPLETED_WORK" },
        orderBy: { createdAt: "desc" },
        take: 5,
      })
    : [];

  const overCapacity = resourceUtilization.filter((u) => u.utilizationPercent != null && u.utilizationPercent > 100);

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Projects</h1>
            <p className="text-sm text-muted-foreground">Owner dashboard — real delivery status, risk, approvals, resourcing, and profitability across every project.</p>
          </div>
          <ProjectForm companies={companies} clients={clients} />
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="p-5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Active projects</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{activeProjects.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Critical alerts</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{criticalAlerts.length}</p>
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
          <Card>
            <CardContent className="p-5">
              <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <Users className="size-3" /> Over capacity
              </p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{overCapacity.length}</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card glass>
            <CardContent className="flex flex-col gap-3 p-5">
              <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <ShieldAlert className="size-4" /> Critical alerts
              </p>
              {criticalAlerts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No critical or high risks open right now.</p>
              ) : (
                criticalAlerts.map((risk) => (
                  <Link key={risk.id} href={`/dashboard/projects/${risk.project.id}/risks`} className="flex items-start justify-between gap-3 border-t border-border/60 pt-3 first:border-0 first:pt-0">
                    <div>
                      <p className="text-sm text-foreground">{risk.title}</p>
                      <p className="text-xs text-muted-foreground">{risk.project.name}</p>
                    </div>
                    <Badge variant={risk.severity === "CRITICAL" ? "default" : "outline"}>{risk.severity}</Badge>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          <Card glass>
            <CardContent className="flex flex-col gap-3 p-5">
              <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Flag className="size-4" /> Upcoming deliveries (14 days)
              </p>
              {upcomingDeliveries.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing due in the next 14 days.</p>
              ) : (
                upcomingDeliveries.map((m) => (
                  <Link key={m.id} href={`/dashboard/projects/${m.project.id}/milestones`} className="flex items-center justify-between gap-3 border-t border-border/60 pt-3 first:border-0 first:pt-0">
                    <div>
                      <p className="text-sm text-foreground">{m.name}</p>
                      <p className="text-xs text-muted-foreground">{m.project.name}</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{m.dueDate?.toLocaleDateString()}</span>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          <Card glass>
            <CardContent className="flex flex-col gap-3 p-5">
              <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <ClipboardCheck className="size-4" /> Pending approvals
              </p>
              {pendingApprovalTasks.length === 0 && pendingApprovalMilestones.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing waiting on approval.</p>
              ) : (
                <>
                  {pendingApprovalTasks.map((t) => (
                    <Link key={t.id} href={`/dashboard/projects/${t.project!.id}/board`} className="flex items-center justify-between gap-3 border-t border-border/60 pt-3 first:border-0 first:pt-0">
                      <div>
                        <p className="text-sm text-foreground">{t.title}</p>
                        <p className="text-xs text-muted-foreground">{t.project!.name} · internal approval</p>
                      </div>
                    </Link>
                  ))}
                  {pendingApprovalMilestones.map((m) => (
                    <Link key={m.id} href={`/dashboard/projects/${m.project.id}/milestones`} className="flex items-center justify-between gap-3 border-t border-border/60 pt-3 first:border-0 first:pt-0">
                      <div>
                        <p className="text-sm text-foreground">{m.name}</p>
                        <p className="text-xs text-muted-foreground">{m.project.name} · awaiting client approval</p>
                      </div>
                    </Link>
                  ))}
                </>
              )}
            </CardContent>
          </Card>

          <Card glass>
            <CardContent className="flex flex-col gap-3 p-5">
              <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Sparkles className="size-4" /> AI suggestions
              </p>
              {recentAiActivity.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No AI Project Manager activity yet. Trigger &quot;Run daily planning&quot; from a project&apos;s Overview page to get real, grounded suggestions.
                </p>
              ) : (
                recentAiActivity.map((a) => (
                  <div key={a.id} className="border-t border-border/60 pt-3 first:border-0 first:pt-0">
                    <p className="text-sm text-foreground">{a.description}</p>
                    <p className="text-xs text-muted-foreground">{a.createdAt.toLocaleDateString()}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {resourceUtilization.length > 0 && (
          <Card glass>
            <CardContent className="flex flex-col gap-3 p-5">
              <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Users className="size-4" /> Resource availability
              </p>
              <div className="flex flex-col divide-y divide-border">
                {resourceUtilization.map((u) => (
                  <div key={u.userId} className="flex items-center justify-between gap-3 py-2">
                    <span className="text-sm text-foreground">{u.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {Math.round(u.assignedOpenHours)}h / {Math.round(u.totalCapacityHoursPerWeek)}h/week across {u.projectCount} project{u.projectCount === 1 ? "" : "s"}
                      </span>
                      {u.utilizationPercent != null && (
                        <Badge variant={u.utilizationPercent > 100 ? "default" : u.utilizationPercent > 85 ? "secondary" : "accent"}>{u.utilizationPercent}%</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-foreground">All projects</h2>
          {projects.length === 0 ? (
            <Card glass>
              <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
                <FolderKanban className="size-8 text-muted-foreground" strokeWidth={1.5} />
                <p className="text-sm text-muted-foreground">No projects yet. Create your first one.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <Link key={project.id} href={`/dashboard/projects/${project.id}`}>
                  <Card glass className="h-full transition-transform duration-150 hover:-translate-y-0.5">
                    <CardContent className="flex flex-col gap-3 p-5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-foreground">{project.name}</p>
                        <div className="flex flex-wrap justify-end gap-1">
                          <Badge variant={STATUS_VARIANT[project.status]}>{project.status.replace("_", " ")}</Badge>
                          <Badge variant={HEALTH_VARIANT[project.healthStatus]}>{project.healthStatus.replace("_", " ")}</Badge>
                        </div>
                      </div>
                      {(project.client?.name ?? project.company?.name) && <p className="text-xs text-muted-foreground">{project.client?.name ?? project.company?.name}</p>}
                      {project.description && <p className="line-clamp-2 text-sm text-muted-foreground">{project.description}</p>}
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${project.progress}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground">{project.progress}%</span>
                      </div>
                      <div className="mt-1 flex items-center gap-3 border-t border-border pt-3 text-xs text-muted-foreground">
                        <span>{project._count.tasks} tasks</span>
                        {project.dueDate && <span>Due {project.dueDate.toLocaleDateString()}</span>}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>
      </Container>
    </main>
  );
}
