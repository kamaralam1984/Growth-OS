import { prisma } from "@/lib/prisma";
import { computeProjectInsights } from "./insights";
import { notifyOrganizationOwners } from "@/lib/notifications";
import { emailOrganizationOwners } from "@/lib/email";
import type { RiskLevel } from "@/generated/prisma/client";

const HEALTH_ALERT_THRESHOLD = 70;

const OPEN_TASK_STATUSES = ["PENDING", "RUNNING", "BLOCKED", "BACKLOG", "REVIEW", "TESTING", "READY_FOR_CLIENT"] as const;
const DONE_STATUSES = new Set(["COMPLETED", "ARCHIVED"]);
const DAY_MS = 86_400_000;

export interface ProjectHealthScores {
  deliveryScore: number;
  qualityScore: number;
  velocityScore: number;
  riskScore: number;
  budgetScore: number;
  customerHappinessScore: number;
  overallScore: number;
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function ratioScore(numerator: number, denominator: number, fallback = 50): number {
  if (denominator <= 0) return fallback;
  return clamp((numerator / denominator) * 100);
}

// Same shared RiskLevel enum ProjectRisk.severity already uses — weights are
// a documented judgment call, mirroring the pattern of every other
// threshold in this codebase (e.g. health.ts's overdue-ratio thresholds).
const RISK_SEVERITY_WEIGHT: Record<RiskLevel, number> = { LOW: 5, MEDIUM: 15, HIGH: 30, CRITICAL: 50 };

/**
 * Pure deterministic composition — zero LLM calls, ever. Reuses the real
 * signal computers already built in insights.ts/risk-detection.ts rather
 * than re-deriving them. Only the Delivery Board *meeting* narrates these
 * numbers; the numbers themselves are never AI-generated.
 */
export async function computeProjectHealthScore(projectId: string): Promise<ProjectHealthScores> {
  const [project, insights, openRisks, milestones, taskCounts, openBugCount, totalTaskCount] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { startDate: true, dueDate: true, progress: true } }),
    computeProjectInsights(projectId),
    prisma.projectRisk.findMany({ where: { projectId, status: "OPEN" }, select: { severity: true } }),
    prisma.milestone.findMany({ where: { projectId }, select: { status: true, dueDate: true, completedAt: true } }),
    prisma.task.groupBy({ by: ["status"], where: { projectId }, _count: { _all: true } }),
    prisma.task.count({ where: { projectId, type: "BUG", status: { in: Array.from(OPEN_TASK_STATUSES) as never[] } } }),
    prisma.task.count({ where: { projectId } }),
  ]);

  // ---- Delivery Score: milestone on-time ratio + schedule adherence ----
  const completedMilestones = milestones.filter((m) => m.status === "COMPLETED");
  const onTimeMilestones = completedMilestones.filter((m) => !m.dueDate || !m.completedAt || m.completedAt <= m.dueDate);
  const milestoneOnTimeScore = ratioScore(onTimeMilestones.length, completedMilestones.length, 65);

  let scheduleAdherenceScore = 55;
  if (project?.startDate && project?.dueDate) {
    const totalDuration = project.dueDate.getTime() - project.startDate.getTime();
    if (totalDuration > 0) {
      const elapsedPercent = clamp(((Date.now() - project.startDate.getTime()) / totalDuration) * 100, 0, 150);
      scheduleAdherenceScore = clamp(100 - Math.abs((project.progress ?? 0) - elapsedPercent));
    }
  }
  const deliveryScore = clamp((milestoneOnTimeScore + scheduleAdherenceScore) / 2);

  // ---- Quality Score: open-bug ratio + testing-stage health ----
  const bugScore = totalTaskCount === 0 ? 70 : clamp(100 - (openBugCount / totalTaskCount) * 300);
  const testingTasks = taskCounts.find((t) => t.status === "TESTING")?._count._all ?? 0;
  const doneTasks = taskCounts.filter((t) => DONE_STATUSES.has(t.status)).reduce((sum, t) => sum + t._count._all, 0);
  const testingHealthScore = ratioScore(doneTasks, doneTasks + testingTasks, 65);
  const qualityScore = clamp((bugScore + testingHealthScore) / 2);

  // ---- Velocity Score: real trailing velocity vs. real deadline ----
  let velocityScore = 50;
  if (insights.completion.estimatedCompletionDate) {
    if (!project?.dueDate) {
      velocityScore = 65; // real measurable velocity, but nothing to compare it against
    } else {
      const overshootDays = (insights.completion.estimatedCompletionDate.getTime() - project.dueDate.getTime()) / DAY_MS;
      velocityScore = overshootDays <= 0 ? clamp(90 - overshootDays * 2, 0, 100) : clamp(90 - overshootDays * 3);
    }
  }

  // ---- Risk Score: weighted count of real OPEN risks by severity ----
  const riskPenalty = openRisks.reduce((sum, r) => sum + RISK_SEVERITY_WEIGHT[r.severity], 0);
  const riskScore = clamp(100 - riskPenalty);

  // ---- Budget Score: real spend ratio ----
  const budgetRatio = insights.budgetRisk.ratio;
  const budgetScore = budgetRatio == null ? 60 : budgetRatio <= 0.5 ? 100 : budgetRatio >= 1.2 ? 0 : clamp(100 - (budgetRatio - 0.5) * 140);

  // ---- Customer Happiness Score: real milestone ratings ----
  const customerHappinessScore = insights.clientSatisfaction == null ? 60 : clamp((insights.clientSatisfaction.average / 5) * 100);

  const overallScore = clamp((deliveryScore + qualityScore + velocityScore + riskScore + budgetScore + customerHappinessScore) / 6);

  return { deliveryScore, qualityScore, velocityScore, riskScore, budgetScore, customerHappinessScore, overallScore };
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Lazily upserts today's health snapshot the first time it's viewed each
 * day — exact precedent of analytics.ts's ensureTodaySnapshot. No cron
 * exists, so this is the honest way to build real trend history rather
 * than backfilling fake past data points. The CURRENT score is always
 * computed fresh (computeProjectHealthScore above); this only persists the
 * once-daily trend point.
 *
 * Also fires the DELIVERY_HEALTH_DROPPED owner notification exactly once
 * per day when the score is below threshold — hooked into this same
 * once-a-day gate so a health score under 70 doesn't re-notify on every
 * page view, only the first time it's computed each day.
 */
export async function ensureTodayProjectHealthSnapshot(projectId: string, organizationId: string, now: Date = new Date()): Promise<void> {
  const today = startOfDay(now);

  const existing = await prisma.projectHealthSnapshot.findUnique({
    where: { projectId_date: { projectId, date: today } },
  });
  if (existing) return;

  const [scores, project] = await Promise.all([
    computeProjectHealthScore(projectId),
    prisma.project.findUnique({ where: { id: projectId }, select: { name: true } }),
  ]);

  await prisma.projectHealthSnapshot.upsert({
    where: { projectId_date: { projectId, date: today } },
    create: { projectId, organizationId, date: today, ...scores },
    update: { ...scores },
  });

  if (scores.overallScore < HEALTH_ALERT_THRESHOLD && project) {
    await notifyOrganizationOwners({
      organizationId,
      type: "DELIVERY_HEALTH_DROPPED",
      title: `Delivery health dropped: ${project.name}`,
      message: `"${project.name}"'s real Delivery Health Score is ${scores.overallScore}/100, below the ${HEALTH_ALERT_THRESHOLD} threshold.`,
    });
    await emailOrganizationOwners({
      organizationId,
      subject: `Delivery health dropped: ${project.name}`,
      text: `"${project.name}"'s real Delivery Health Score is ${scores.overallScore}/100 (Delivery ${scores.deliveryScore}, Quality ${scores.qualityScore}, Velocity ${scores.velocityScore}, Risk ${scores.riskScore}, Budget ${scores.budgetScore}, Customer Happiness ${scores.customerHappinessScore}) — below the ${HEALTH_ALERT_THRESHOLD} threshold. Review it on the project's Delivery Board.`,
    });
  }
}
