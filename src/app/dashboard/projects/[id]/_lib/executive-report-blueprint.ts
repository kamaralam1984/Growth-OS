import type { DocumentBlueprint, DocumentSection } from "@/lib/documents";
import type { ProjectInsights } from "@/lib/projects/insights";
import type { MemberUtilization } from "@/lib/projects/analytics";

export interface ExecutiveReportInput {
  organizationName: string;
  logoUrl?: string | null;
  gstNumber?: string | null;
  registrationNumber?: string | null;
  projectName: string;
  projectId: string;
  clientName?: string | null;
  status: string;
  healthStatus: string;
  progress: number;
  priority: string;
  dueDate?: Date | null;
  budget: number | null;
  spend: number;
  currency?: string | null;
  milestones: Array<{ name: string; status: string; dueDate: Date | null; clientApproved: boolean }>;
  openRisks: Array<{ title: string; category: string; severity: string }>;
  team: MemberUtilization[];
  insights: ProjectInsights;
}

function money(value: number, currency?: string | null): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD", maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${currency ?? ""} ${value.toLocaleString()}`.trim();
  }
}

/** A generated-on-demand executive summary, built from the same real, already-computed metrics shown on the project's Overview/Risks pages — never a fabricated narrative. */
export function buildExecutiveReportBlueprint(input: ExecutiveReportInput): DocumentBlueprint {
  const { insights } = input;
  const budgetRatio = input.budget && input.budget > 0 ? input.spend / input.budget : null;

  const overviewBullets = [
    `Status: ${input.status.replace(/_/g, " ")} · Health: ${input.healthStatus.replace(/_/g, " ")}`,
    `Progress: ${input.progress}% complete`,
    `Priority: ${input.priority}`,
    input.dueDate ? `Due date: ${input.dueDate.toLocaleDateString()}` : "Due date: not set",
    input.clientName ? `Client: ${input.clientName}` : null,
  ].filter((b): b is string => !!b);

  const sections: DocumentSection[] = [
    { heading: "Project Overview", bullets: overviewBullets },
    {
      heading: "Budget",
      body:
        input.budget != null
          ? `${money(input.spend, input.currency)} spent of ${money(input.budget, input.currency)} budget (${budgetRatio != null ? Math.round(budgetRatio * 100) : 0}%). Spend trend: ${insights.budgetRisk.trend ?? "unknown"}.`
          : `${money(input.spend, input.currency)} spent. No budget has been set for this project.`,
    },
    {
      heading: "AI Insights",
      bullets: [
        insights.completion.estimatedCompletionDate
          ? `Predicted completion: ${insights.completion.estimatedCompletionDate.toLocaleDateString()} (${insights.completion.basis})`
          : `Completion prediction: not enough recent history yet.`,
        insights.resourceShortage
          ? `Team capacity: ${Math.round(insights.resourceShortage.assignedOpenHours)}h assigned against ${Math.round(insights.resourceShortage.totalCapacityHoursPerWeek)}h/week real capacity${insights.resourceShortage.shortfallHours > 0 ? ` — shortfall of ${Math.round(insights.resourceShortage.shortfallHours)}h` : ""}.`
          : "Team capacity: no capacity data set for this project's team.",
        insights.clientSatisfaction
          ? `Client satisfaction: ${insights.clientSatisfaction.average.toFixed(1)}/5 from ${insights.clientSatisfaction.count} milestone rating(s).`
          : "Client satisfaction: not enough data yet.",
      ],
    },
  ];

  if (input.milestones.length > 0) {
    sections.push({
      heading: "Milestones",
      table: {
        headers: ["Milestone", "Status", "Due Date", "Client Approved"],
        rows: input.milestones.map((m) => [m.name, m.status.replace(/_/g, " "), m.dueDate ? m.dueDate.toLocaleDateString() : "—", m.clientApproved ? "Yes" : "No"]),
      },
    });
  }

  if (input.openRisks.length > 0) {
    sections.push({
      heading: "Open Risks",
      table: {
        headers: ["Risk", "Category", "Severity"],
        rows: input.openRisks.map((r) => [r.title, r.category.replace(/_/g, " "), r.severity]),
      },
    });
  }

  if (input.team.length > 0) {
    sections.push({
      heading: "Team Utilization",
      table: {
        headers: ["Member", "Assigned Open Hours", "Capacity/Week", "Utilization"],
        rows: input.team.map((t) => [t.name, Math.round(t.assignedOpenHours), Math.round(t.totalCapacityHoursPerWeek), t.utilizationPercent != null ? `${t.utilizationPercent}%` : "—"]),
        alignRightColumns: [1, 2, 3],
      },
    });
  }

  return {
    // DocumentEngineKind is 1:1 with the real DocumentKind Prisma enum (used
    // by DocumentVersion.docKind) — adding a new enum value would need a
    // migration for a report that isn't persisted/versioned at all. Tagged
    // as BUSINESS_DOCUMENT instead; docKind isn't read by the PDF renderer,
    // only by versioning, which this on-demand report never calls.
    docKind: "BUSINESS_DOCUMENT",
    title: "Executive Report",
    subtitle: input.projectName,
    documentNumber: `EXEC-${input.projectId.slice(-8).toUpperCase()}`,
    brand: { organizationName: input.organizationName, logoUrl: input.logoUrl, gstNumber: input.gstNumber, registrationNumber: input.registrationNumber },
    tableOfContents: true,
    sections,
    footerText: input.organizationName,
    generatedAt: new Date(),
  };
}
