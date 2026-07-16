import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Users, Flag, ShieldAlert, DollarSign, FileBarChart } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { requireActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { computeProjectSpend } from "@/lib/projects/health";
import { computeResourceUtilization } from "@/lib/projects/analytics";
import { ProjectStatusSelect } from "../_components/project-status-select";
import { ProjectTeamPanel } from "./_components/project-team-panel";
import { AiPlanningPanel } from "./_components/ai-planning-panel";

const HEALTH_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "accent" }> = {
  ON_TRACK: { label: "On track", variant: "accent" },
  AT_RISK: { label: "At risk", variant: "secondary" },
  OFF_TRACK: { label: "Off track", variant: "default" },
};

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { membership } = await requireActiveMembership(`/dashboard/projects/${id}`);
  const organizationId = membership.organizationId;
  const canManage = membership.role === "OWNER" || membership.role === "ADMIN";

  const [project, taskCounts, openRisks, upcomingMilestones, allMembers, spend, utilization] = await Promise.all([
    prisma.project.findUnique({
      where: { id },
      include: {
        company: { select: { name: true } },
        client: { select: { name: true } },
        deal: { select: { name: true } },
        members: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
    }),
    prisma.task.groupBy({ by: ["status"], where: { projectId: id }, _count: { _all: true } }),
    prisma.projectRisk.findMany({ where: { projectId: id, status: "OPEN" }, orderBy: { severity: "desc" }, take: 5 }),
    prisma.milestone.findMany({ where: { projectId: id, status: { not: "COMPLETED" } }, orderBy: { order: "asc" }, take: 5 }),
    prisma.membership.findMany({
      where: { organizationId, status: "ACTIVE" },
      select: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    computeProjectSpend(id),
    computeResourceUtilization(organizationId, { projectId: id }),
  ]);

  if (!project || project.organizationId !== organizationId) {
    notFound();
  }

  const utilizationByUser = new Map(utilization.map((u) => [u.userId, u.utilizationPercent]));
  const totalTasks = taskCounts.reduce((sum, c) => sum + c._count._all, 0);
  const completedTasks = taskCounts.find((c) => c.status === "COMPLETED")?._count._all ?? 0;
  const health = HEALTH_BADGE[project.healthStatus] ?? HEALTH_BADGE.ON_TRACK;
  const budgetRatio = project.budget && project.budget > 0 ? spend / project.budget : null;

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <Card glass>
          <CardContent className="flex flex-col gap-4 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight text-foreground">{project.name}</h1>
                  <Badge variant="outline">{project.status.replace(/_/g, " ")}</Badge>
                  <Badge variant={health.variant}>{health.label}</Badge>
                  {project.projectType && <Badge variant="outline">{project.projectType.replace(/_/g, " ")}</Badge>}
                  <Badge variant="outline">{project.priority}</Badge>
                </div>
                {project.description && <p className="mt-2 text-sm text-muted-foreground">{project.description}</p>}
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {project.company && <span>Company: {project.company.name}</span>}
                  {project.client && <span>Client: {project.client.name}</span>}
                  {project.deal && <span>From deal: {project.deal.name}</span>}
                  {project.department && <span>Department: {project.department}</span>}
                  {project.dueDate && <span>Due {project.dueDate.toLocaleDateString()}</span>}
                </div>
                {project.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {project.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {canManage && <ProjectStatusSelect projectId={project.id} status={project.status} />}
            </div>

            <div className="grid grid-cols-2 gap-3 border-t border-border pt-4 sm:grid-cols-4">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Progress</p>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${project.progress}%` }} />
                  </div>
                  <span className="text-sm font-semibold text-foreground">{project.progress}%</span>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Tasks</p>
                <p className="text-sm font-semibold text-foreground">
                  {completedTasks}/{totalTasks} done
                </p>
              </div>
              <div>
                <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  <DollarSign className="size-3" /> Budget
                </p>
                <p className="text-sm font-semibold text-foreground">
                  {project.budget != null ? `${Math.round(spend)} / ${project.budget}` : "Not set"}
                  {budgetRatio != null && <span className="ml-1 text-xs text-muted-foreground">({Math.round(budgetRatio * 100)}%)</span>}
                </p>
              </div>
              <div>
                <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  <Users className="size-3" /> Team
                </p>
                <p className="text-sm font-semibold text-foreground">{project.members.length} member{project.members.length === 1 ? "" : "s"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Link href={`/dashboard/projects/${id}/board`} className="lg:col-span-1">
            <Card glass className="h-full transition-transform duration-150 hover:-translate-y-0.5">
              <CardContent className="flex items-center justify-between gap-2 p-5">
                <div>
                  <p className="font-medium text-foreground">Board</p>
                  <p className="text-xs text-muted-foreground">{totalTasks} tasks across 8 columns</p>
                </div>
                <ArrowRight className="size-4 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
          <Link href={`/dashboard/projects/${id}/milestones`} className="lg:col-span-1">
            <Card glass className="h-full transition-transform duration-150 hover:-translate-y-0.5">
              <CardContent className="flex items-center justify-between gap-2 p-5">
                <div>
                  <p className="flex items-center gap-1.5 font-medium text-foreground">
                    <Flag className="size-4" /> Milestones
                  </p>
                  <p className="text-xs text-muted-foreground">{upcomingMilestones.length} upcoming</p>
                </div>
                <ArrowRight className="size-4 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
          <Link href={`/dashboard/projects/${id}/risks`} className="lg:col-span-1">
            <Card glass className="h-full transition-transform duration-150 hover:-translate-y-0.5">
              <CardContent className="flex items-center justify-between gap-2 p-5">
                <div>
                  <p className="flex items-center gap-1.5 font-medium text-foreground">
                    <ShieldAlert className="size-4" /> Risks
                  </p>
                  <p className="text-xs text-muted-foreground">{openRisks.length} open</p>
                </div>
                <ArrowRight className="size-4 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <AiPlanningPanel projectId={id} canManage={canManage} />
          <ProjectTeamPanel
            projectId={id}
            canManage={canManage}
            members={project.members.map((m) => ({
              userId: m.userId,
              name: m.user.name,
              email: m.user.email,
              role: m.role,
              hourlyRate: m.hourlyRate,
              capacityHoursPerWeek: m.capacityHoursPerWeek,
              utilizationPercent: utilizationByUser.get(m.userId) ?? null,
            }))}
            orgMembers={allMembers.map((m) => m.user)}
          />
        </div>

        <Card glass>
          <CardContent className="flex flex-col gap-3 p-5">
            <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <FileBarChart className="size-4" /> Reports
            </p>
            <div className="flex flex-wrap gap-2 text-xs">
              {(["weekly", "monthly", "team", "budget", "time"] as const).map((type) => (
                <div key={type} className="flex items-center gap-1 rounded-lg border border-border px-2 py-1">
                  <span className="capitalize text-foreground">{type}</span>
                  {(["csv", "excel", "pdf"] as const).map((format) => (
                    <a
                      key={format}
                      href={`/api/export/project-report/${type}?projectId=${id}&format=${format}`}
                      className="rounded px-1.5 py-0.5 text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
                    >
                      {format.toUpperCase()}
                    </a>
                  ))}
                </div>
              ))}
              <a
                href={`/api/export/project-executive-report/${id}`}
                className="flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-2 py-1 text-primary hover:underline"
              >
                Executive Report (PDF)
              </a>
            </div>
          </CardContent>
        </Card>

        {openRisks.length > 0 && (
          <Card glass>
            <CardContent className="flex flex-col gap-3 p-5">
              <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <ShieldAlert className="size-4" /> Open risks
              </p>
              {openRisks.map((risk) => (
                <div key={risk.id} className="flex items-start justify-between gap-3 border-t border-border/60 pt-3 first:border-0 first:pt-0">
                  <div>
                    <p className="text-sm text-foreground">{risk.title}</p>
                    <p className="text-xs text-muted-foreground">{risk.description}</p>
                  </div>
                  <Badge variant={risk.severity === "CRITICAL" || risk.severity === "HIGH" ? "default" : "outline"}>{risk.severity}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </Container>
    </main>
  );
}
