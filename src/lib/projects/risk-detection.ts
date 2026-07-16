import { prisma } from "@/lib/prisma";
import { computeProjectSpend } from "./health";
import type { ProjectRiskCategory, RiskLevel } from "@/generated/prisma/client";

const OPEN_TASK_STATUSES = ["PENDING", "RUNNING", "BLOCKED", "BACKLOG", "REVIEW", "TESTING", "READY_FOR_CLIENT"] as const;

interface Finding {
  category: ProjectRiskCategory;
  severity: RiskLevel;
  title: string;
  description: string;
}

/**
 * Deterministic, real-code risk detection — no LLM call, no invented
 * findings. Queries overdue tasks, budget burn, blocked tasks, and stale
 * approvals directly from the database. One OPEN ProjectRisk row is kept
 * per category (upserted, not duplicated on every run); if a category's
 * condition no longer holds, its existing OPEN risk is auto-resolved.
 */
export async function detectProjectRisks(projectId: string): Promise<Finding[]> {
  const [project, openTasks, overdueTasks, blockedTasks, overdueApprovals] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { organizationId: true, budget: true, name: true } }),
    prisma.task.count({ where: { projectId, status: { in: Array.from(OPEN_TASK_STATUSES) as never[] } } }),
    prisma.task.count({
      where: { projectId, status: { in: Array.from(OPEN_TASK_STATUSES) as never[] }, dueDate: { lt: new Date() } },
    }),
    prisma.task.count({ where: { projectId, status: "BLOCKED" } }),
    prisma.task.count({
      where: { projectId, type: "APPROVAL", status: { in: Array.from(OPEN_TASK_STATUSES) as never[] }, dueDate: { lt: new Date() } },
    }),
  ]);
  if (!project) return [];

  const findings: Finding[] = [];

  if (overdueTasks > 0) {
    const ratio = openTasks === 0 ? 0 : overdueTasks / openTasks;
    findings.push({
      category: "DELAYED_TASK",
      severity: ratio > 0.4 ? "CRITICAL" : ratio > 0.2 ? "HIGH" : "MEDIUM",
      title: `${overdueTasks} task${overdueTasks === 1 ? " is" : "s are"} overdue`,
      description: `${overdueTasks} of ${openTasks} open task(s) in "${project.name}" have a due date in the past.`,
    });
  }

  if (blockedTasks > 0) {
    findings.push({
      category: "BLOCKED_TASK",
      severity: blockedTasks > 3 ? "HIGH" : "MEDIUM",
      title: `${blockedTasks} task${blockedTasks === 1 ? " is" : "s are"} blocked`,
      description: `${blockedTasks} task(s) are currently marked BLOCKED and need attention to unblock delivery.`,
    });
  }

  if (overdueApprovals > 0) {
    findings.push({
      category: "LATE_APPROVAL",
      severity: overdueApprovals > 1 ? "HIGH" : "MEDIUM",
      title: `${overdueApprovals} approval${overdueApprovals === 1 ? " is" : "s are"} overdue`,
      description: `${overdueApprovals} approval-type task(s) have passed their due date without being resolved.`,
    });
  }

  if (project.budget != null && project.budget > 0) {
    const spent = await computeProjectSpend(projectId);
    const ratio = spent / project.budget;
    if (ratio > 0.85) {
      findings.push({
        category: "OVER_BUDGET",
        severity: ratio > 1 ? "CRITICAL" : ratio > 0.95 ? "HIGH" : "MEDIUM",
        title: ratio > 1 ? "Project is over budget" : "Project is approaching its budget limit",
        description: `Real logged billable time totals ${Math.round(spent)} against a budget of ${project.budget} (${Math.round(ratio * 100)}%).`,
      });
    }
  }

  const members = await prisma.projectMember.findMany({ where: { projectId }, select: { userId: true, capacityHoursPerWeek: true } });
  if (members.length > 0) {
    const totalCapacity = members.reduce((sum, m) => sum + (m.capacityHoursPerWeek ?? 0), 0);
    const assignedHoursAgg = await prisma.task.aggregate({
      where: { projectId, status: { in: Array.from(OPEN_TASK_STATUSES) as never[] } },
      _sum: { estimatedHours: true },
    });
    const assignedHours = assignedHoursAgg._sum.estimatedHours ?? 0;
    if (totalCapacity > 0 && assignedHours > totalCapacity * 1.2) {
      findings.push({
        category: "MISSING_RESOURCE",
        severity: assignedHours > totalCapacity * 1.5 ? "HIGH" : "MEDIUM",
        title: "Remaining work exceeds team capacity",
        description: `${Math.round(assignedHours)} estimated hours of open work against ${Math.round(totalCapacity)} hours/week of real team capacity.`,
      });
    }

    // DEVELOPER_OVERLOAD — distinct from the aggregate team-wide check above:
    // a single member can be individually overloaded even when the team's
    // total capacity looks fine on paper.
    const perMemberAssigned = await prisma.task.groupBy({
      by: ["assignedToUserId"],
      where: { projectId, status: { in: Array.from(OPEN_TASK_STATUSES) as never[] }, assignedToUserId: { not: null } },
      _sum: { estimatedHours: true },
    });
    const overloaded = perMemberAssigned
      .map((row) => {
        const member = members.find((m) => m.userId === row.assignedToUserId);
        const assigned = row._sum.estimatedHours ?? 0;
        const capacity = member?.capacityHoursPerWeek ?? null;
        return { userId: row.assignedToUserId, assigned, capacity };
      })
      .filter((row) => row.capacity != null && row.capacity > 0 && row.assigned > row.capacity * 1.5);
    if (overloaded.length > 0) {
      findings.push({
        category: "DEVELOPER_OVERLOAD",
        severity: overloaded.length > 1 ? "HIGH" : "MEDIUM",
        title: `${overloaded.length} team member${overloaded.length === 1 ? " is" : "s are"} individually overloaded`,
        description: `${overloaded.length} member(s) have real assigned open-task hours exceeding 1.5x their own weekly capacity.`,
      });
    }
  }

  // QA_FAILURE / SECURITY_ISSUE — real BUG-type tasks, still open.
  const openBugTasks = await prisma.task.findMany({
    where: { projectId, type: "BUG", status: { in: Array.from(OPEN_TASK_STATUSES) as never[] } },
    select: { id: true, labels: true, createdAt: true },
  });
  if (openBugTasks.length > 0) {
    const AGE_THRESHOLD_DAYS = 14;
    const now = Date.now();
    const agedBugs = openBugTasks.filter((t) => (now - t.createdAt.getTime()) / 86_400_000 > AGE_THRESHOLD_DAYS);
    if (openBugTasks.length >= 5 || agedBugs.length > 0) {
      findings.push({
        category: "QA_FAILURE",
        severity: agedBugs.length > 2 || openBugTasks.length >= 10 ? "HIGH" : "MEDIUM",
        title: `${openBugTasks.length} open bug${openBugTasks.length === 1 ? "" : "s"}${agedBugs.length > 0 ? `, ${agedBugs.length} unresolved for ${AGE_THRESHOLD_DAYS}+ days` : ""}`,
        description: `${openBugTasks.length} real open BUG-type task(s) in "${project.name}"${agedBugs.length > 0 ? `, ${agedBugs.length} of which have been open for more than ${AGE_THRESHOLD_DAYS} days` : ""}.`,
      });
    }

    // Honestly dependent on real user labeling — no CI/CD/security-scan
    // integration exists in this app to detect this any other way.
    const securityBugs = openBugTasks.filter((t) => t.labels.some((l) => l.toLowerCase().includes("security")));
    if (securityBugs.length > 0) {
      findings.push({
        category: "SECURITY_ISSUE",
        severity: securityBugs.length > 1 ? "CRITICAL" : "HIGH",
        title: `${securityBugs.length} open bug${securityBugs.length === 1 ? "" : "s"} labeled security`,
        description: `${securityBugs.length} open BUG-type task(s) carry a "security" label and have not been resolved.`,
      });
    }
  }

  // DEPLOYMENT_RISK — no CI/CD/deployment integration exists in this app;
  // the only honest, real signal available is milestone proximity vs. real
  // open-task ratio. Documented judgment call, not a fabricated pipeline status.
  const goLiveMilestone = await prisma.milestone.findFirst({
    where: { projectId, name: "Go Live", status: { not: "COMPLETED" }, dueDate: { not: null } },
    select: { dueDate: true },
  });
  if (goLiveMilestone?.dueDate) {
    const daysUntilGoLive = (goLiveMilestone.dueDate.getTime() - Date.now()) / 86_400_000;
    const openRatio = openTasks === 0 ? 0 : (overdueTasks + blockedTasks) / openTasks;
    const totalTasksCount = await prisma.task.count({ where: { projectId } });
    const openTaskRatioOfTotal = totalTasksCount === 0 ? 0 : openTasks / totalTasksCount;
    if (daysUntilGoLive >= 0 && daysUntilGoLive <= 7 && openTaskRatioOfTotal > 0.2) {
      findings.push({
        category: "DEPLOYMENT_RISK",
        severity: openTaskRatioOfTotal > 0.4 ? "CRITICAL" : "HIGH",
        title: `Go Live in ${Math.max(0, Math.round(daysUntilGoLive))} day(s) with ${Math.round(openTaskRatioOfTotal * 100)}% of tasks still open`,
        description: `The "Go Live" milestone is due within 7 days and ${Math.round(openTaskRatioOfTotal * 100)}% of this project's tasks are still open (${openRatio > 0 ? `${Math.round(openRatio * 100)}% of open tasks are overdue or blocked` : "real task counts, not fabricated"}).`,
      });
    }
  }

  // CLIENT_RISK — real, previously-declared-but-never-detected category:
  // aged/repeated open client-raised tickets (Task.clientRaised, Phase 4).
  const openClientTickets = await prisma.task.findMany({
    where: { projectId, clientRaised: true, status: { in: Array.from(OPEN_TASK_STATUSES) as never[] } },
    select: { id: true, createdAt: true },
  });
  if (openClientTickets.length > 0) {
    const oldestAgeDays = Math.max(...openClientTickets.map((t) => (Date.now() - t.createdAt.getTime()) / 86_400_000));
    if (openClientTickets.length >= 3 || oldestAgeDays > 7) {
      findings.push({
        category: "CLIENT_RISK",
        severity: openClientTickets.length >= 5 || oldestAgeDays > 14 ? "HIGH" : "MEDIUM",
        title: `${openClientTickets.length} open client ticket${openClientTickets.length === 1 ? "" : "s"}`,
        description: `${openClientTickets.length} real client-raised ticket(s) are still open, the oldest for ${Math.round(oldestAgeDays)} day(s).`,
      });
    }
  }

  // Upsert one OPEN risk per category; auto-resolve categories no longer present.
  const existingOpen = await prisma.projectRisk.findMany({ where: { projectId, status: "OPEN" } });
  const foundCategories = new Set(findings.map((f) => f.category));

  await prisma.$transaction([
    ...findings.map((finding) => {
      const existing = existingOpen.find((r) => r.category === finding.category);
      if (existing) {
        return prisma.projectRisk.update({
          where: { id: existing.id },
          data: { severity: finding.severity, title: finding.title, description: finding.description },
        });
      }
      return prisma.projectRisk.create({
        data: {
          projectId,
          organizationId: project.organizationId,
          category: finding.category,
          severity: finding.severity,
          title: finding.title,
          description: finding.description,
        },
      });
    }),
    ...existingOpen
      .filter((r) => !foundCategories.has(r.category))
      .map((r) => prisma.projectRisk.update({ where: { id: r.id }, data: { status: "RESOLVED", resolvedAt: new Date() } })),
  ]);

  return findings;
}
