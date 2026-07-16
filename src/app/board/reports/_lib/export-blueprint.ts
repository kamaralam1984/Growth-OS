import type { ReportBlueprint } from "@/lib/reports/report-blueprint";
import type { AgentProductivityRow, PeriodReport, ReportPeriod } from "@/lib/reports";

const PERIOD_LABEL: Record<ReportPeriod, string> = {
  daily: "Today",
  weekly: "This week",
  monthly: "This month",
  quarterly: "This quarter",
  yearly: "This year",
};

export interface BoardReportBrand {
  organizationName: string;
  logoUrl?: string | null;
  gstNumber?: string | null;
  registrationNumber?: string | null;
}

/**
 * Maps the exact same PeriodReport/AgentProductivityRow data already
 * fetched and rendered on the Board Reports page (see getPeriodReport /
 * getAgentProductivity in src/lib/reports.ts) into a ReportBlueprint for
 * the Report Export Service — no fabricated numbers, only what the page
 * already shows.
 */
export function buildBoardReportBlueprint(
  report: PeriodReport,
  agents: AgentProductivityRow[],
  brand: BoardReportBrand,
): ReportBlueprint {
  const sections: ReportBlueprint["sections"] = [
    {
      heading: "Overview",
      bullets: [
        `Meetings held: ${report.meetingsHeld}`,
        `Tasks completed: ${report.tasksCompleted}`,
        `Decisions made: ${report.decisionsMade}`,
        `Messages exchanged: ${report.messagesExchanged}`,
      ],
    },
  ];

  if (agents.length > 0) {
    sections.push({
      heading: "Agent Productivity",
      table: {
        headers: ["Agent", "Type", "Status", "Completed Tasks", "Avg. Confidence"],
        rows: agents.map((agent) => [
          agent.name,
          agent.type,
          agent.active ? "Active" : "Paused",
          agent.completedTasksCount,
          agent.confidenceScore !== null ? `${Math.max(0, Math.min(100, Math.round(agent.confidenceScore)))}%` : "Not yet scored",
        ]),
        alignRightColumns: [3, 4],
      },
    });
  }

  if (report.meetings.length > 0) {
    sections.push({
      heading: "Meetings",
      table: {
        headers: ["Meeting", "Status", "Created", "Duration (min)", "Participants"],
        rows: report.meetings.map((meeting) => [
          meeting.title,
          meeting.status,
          meeting.createdAt.toLocaleString(),
          meeting.durationMinutes ?? "—",
          meeting.participantCount,
        ]),
        alignRightColumns: [3, 4],
      },
    });
  }

  if (report.decisions.length > 0) {
    sections.push({
      heading: "Decisions",
      body: `By status — ${(Object.keys(report.decisionsByStatus) as Array<keyof typeof report.decisionsByStatus>)
        .map((status) => `${status}: ${report.decisionsByStatus[status]}`)
        .join(" · ")}`,
      table: {
        headers: ["Topic", "Status", "Raised", "Finalized"],
        rows: report.decisions.map((decision) => [
          decision.topic,
          decision.status,
          decision.createdAt.toLocaleString(),
          decision.finalizedAt ? decision.finalizedAt.toLocaleString() : "—",
        ]),
      },
    });
  }

  return {
    title: "Board Report",
    subtitle: `${PERIOD_LABEL[report.period]} — ${report.rangeStart.toLocaleString()} through ${report.rangeEnd.toLocaleString()}`,
    brand: {
      organizationName: brand.organizationName,
      logoUrl: brand.logoUrl,
      gstNumber: brand.gstNumber,
      registrationNumber: brand.registrationNumber,
    },
    generatedAt: new Date(),
    sections,
    footerText: brand.organizationName,
  };
}
