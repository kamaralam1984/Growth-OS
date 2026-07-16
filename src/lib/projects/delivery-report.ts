import { prisma } from "@/lib/prisma";
import { computeProjectHealthScore } from "./health-score";
import { computeProjectSpend } from "./health";
import type { DeliveryReportType } from "@/generated/prisma/client";

const REPORT_WINDOW_DAYS: Record<DeliveryReportType, number> = {
  DAILY: 1,
  WEEKLY: 7,
  MONTHLY: 30,
  PROJECT_HEALTH: 30,
  RISK: 30,
};

/**
 * Builds a real, plain-text delivery report summary from real project data
 * — no LLM call, no fabricated content. sendEmail has no attachment
 * support, so this summary IS the email body (plus a link back to the
 * project's Delivery Board for the full picture).
 */
export async function buildDeliveryReportSummary(projectId: string, type: DeliveryReportType): Promise<{ summary: string; projectName: string; organizationId: string }> {
  const windowDays = REPORT_WINDOW_DAYS[type];
  const since = new Date(Date.now() - windowDays * 86_400_000);

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true, organizationId: true, progress: true, budget: true } });
  if (!project) throw new Error("Project not found.");

  const [scores, spend, completions, openRisks, upcomingMilestones] = await Promise.all([
    computeProjectHealthScore(projectId),
    computeProjectSpend(projectId),
    prisma.taskStatusChange.count({ where: { task: { projectId }, toStatus: { in: ["COMPLETED", "ARCHIVED"] }, changedAt: { gte: since } } }),
    prisma.projectRisk.findMany({ where: { projectId, status: "OPEN" }, orderBy: { severity: "desc" }, take: 10, select: { title: true, severity: true, category: true } }),
    prisma.milestone.findMany({ where: { projectId, status: { not: "COMPLETED" }, dueDate: { not: null } }, orderBy: { dueDate: "asc" }, take: 5, select: { name: true, dueDate: true } }),
  ]);

  const lines: string[] = [
    `${project.name} — Real Delivery Health Score: ${scores.overallScore}/100`,
    `(Delivery ${scores.deliveryScore} · Quality ${scores.qualityScore} · Velocity ${scores.velocityScore} · Risk ${scores.riskScore} · Budget ${scores.budgetScore} · Customer Happiness ${scores.customerHappinessScore})`,
    "",
    `Progress: ${project.progress}%`,
    project.budget != null ? `Budget: ${Math.round(spend)} spent of ${project.budget}` : "Budget: not set",
    `Tasks completed in the last ${windowDays} day(s): ${completions}`,
    "",
    `Open risks (${openRisks.length}):`,
    ...(openRisks.length > 0 ? openRisks.map((r) => `- [${r.severity}] ${r.category.replace(/_/g, " ")}: ${r.title}`) : ["- None currently open."]),
    "",
    `Upcoming milestones:`,
    ...(upcomingMilestones.length > 0
      ? upcomingMilestones.map((m) => `- ${m.name}${m.dueDate ? ` (due ${m.dueDate.toISOString().slice(0, 10)})` : ""}`)
      : ["- None scheduled."]),
  ];

  return { summary: lines.join("\n"), projectName: project.name, organizationId: project.organizationId };
}
