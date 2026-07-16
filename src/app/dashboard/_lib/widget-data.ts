import { prisma } from "@/lib/prisma";
import { computePipelineTotals } from "@/lib/company-health";
import { getWeather, type WeatherResult } from "@/lib/weather";
import type { WidgetType } from "@/generated/prisma/client";

/**
 * Real, per-type data bundle for every widget on a user's dashboard grid.
 * Fetched once per page load (a handful of cheap, indexed queries) and
 * passed down to the client-side <WidgetGrid>, which only ever renders data
 * it was given — it never calls Prisma itself. Every field here traces to a
 * real row; there is no synthetic content anywhere in this file.
 */
export interface WidgetDataBundle {
  tasks: Array<{ id: string; title: string; status: string; dueDate: Date | null }>;
  upcomingMeetings: Array<{ id: string; title: string; status: string }>;
  aiActivity: Array<{ id: string; description: string; actorName: string | null; createdAt: Date }>;
  reports: { meetingsThisWeek: number; tasksCompletedThisWeek: number; decisionsThisWeek: number };
  pipelineValue: number;
  wonValue: number;
  revenueMonthly: number;
  // null when no WEATHER widget with a configured city exists for this org
  // yet — the widget itself prompts the user to set one in that case. Only
  // one city is resolved per page load (the org's oldest WEATHER widget)
  // since this bundle is shared across every widget on the grid.
  weather: WeatherResult | null;
}

export async function getWidgetDataBundle(organizationId: string): Promise<WidgetDataBundle> {
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  weekStart.setHours(0, 0, 0, 0);

  const [tasks, upcomingMeetings, recentActivity, meetingsThisWeek, tasksCompletedThisWeek, decisionsThisWeek, pipeline, wonLeads, weatherWidget] =
    await Promise.all([
      prisma.task.findMany({
        where: { organizationId, status: { notIn: ["COMPLETED", "CANCELLED"] } },
        orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
        take: 6,
        select: { id: true, title: true, status: true, dueDate: true },
      }),
      prisma.meeting.findMany({
        where: { organizationId, status: { in: ["SCHEDULED", "LIVE"] } },
        orderBy: { createdAt: "asc" },
        take: 6,
        select: { id: true, title: true, status: true },
      }),
      prisma.activity.findMany({
        where: { organizationId, actorAgentId: { not: null } },
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { actorAgent: { select: { name: true } } },
      }),
      prisma.meeting.count({ where: { organizationId, createdAt: { gte: weekStart } } }),
      prisma.task.count({ where: { organizationId, status: "COMPLETED", updatedAt: { gte: weekStart } } }),
      prisma.decision.count({ where: { organizationId, status: { not: "PENDING" }, finalizedAt: { gte: weekStart } } }),
      computePipelineTotals(organizationId),
      prisma.lead.findMany({
        where: { pipelineStage: { workspace: { organizationId }, name: "Won" }, createdAt: { gte: weekStart } },
        select: { estimatedValue: true },
      }),
      prisma.widget.findFirst({
        where: { type: "WEATHER", dashboard: { organizationId } },
        orderBy: { createdAt: "asc" },
        select: { config: true },
      }),
    ]);

  // The external OpenWeatherMap request is only made when a WEATHER widget
  // actually exists with a city configured — never fetched unconditionally.
  const weatherCity = (weatherWidget?.config as unknown as { city?: string } | null)?.city;
  const weather = weatherCity ? await getWeather(weatherCity) : null;

  return {
    tasks,
    upcomingMeetings,
    aiActivity: recentActivity.map((a) => ({
      id: a.id,
      description: a.description,
      actorName: a.actorAgent?.name ?? null,
      createdAt: a.createdAt,
    })),
    reports: { meetingsThisWeek, tasksCompletedThisWeek, decisionsThisWeek },
    pipelineValue: pipeline.pipelineValue,
    wonValue: pipeline.wonValue,
    revenueMonthly: wonLeads.reduce((sum, l) => sum + (l.estimatedValue ?? 0), 0),
    weather,
  };
}

export const WIDGET_TITLES: Record<WidgetType, string> = {
  REVENUE: "Revenue",
  PIPELINE: "Pipeline",
  TASKS: "Tasks",
  CALENDAR: "Calendar",
  NOTES: "Notes",
  AI_ACTIVITY: "AI Activity",
  REPORTS: "Reports",
  WEATHER: "Weather",
  CLOCK: "Clock",
  UPCOMING_MEETINGS: "Upcoming Meetings",
};
