import type { WidgetPosition } from "@/lib/dashboard";
import type { WidgetType } from "@/generated/prisma/client";

// A "use server" file (src/components/command-center/dashboard-actions.ts)
// can only export async functions — plain constants live here instead so
// both that server-action module and client components (the dashboard
// switcher) can import them directly.

export const ACTIVE_DASHBOARD_COOKIE = "activeDashboardId";

/** Preset widget layouts offered when creating a new (non-default) dashboard. */
export const DASHBOARD_TEMPLATES: Record<string, { label: string; widgets: Array<{ type: WidgetType; position: WidgetPosition }> }> = {
  blank: { label: "Blank", widgets: [] },
  sales: {
    label: "Sales Focused",
    widgets: [
      { type: "PIPELINE", position: { x: 0, y: 0, w: 8, h: 5 } },
      { type: "REVENUE", position: { x: 8, y: 0, w: 4, h: 5 } },
      { type: "UPCOMING_MEETINGS", position: { x: 0, y: 5, w: 6, h: 4 } },
      { type: "TASKS", position: { x: 6, y: 5, w: 6, h: 4 } },
    ],
  },
  executive: {
    label: "Executive Overview",
    widgets: [
      { type: "REVENUE", position: { x: 0, y: 0, w: 6, h: 4 } },
      { type: "PIPELINE", position: { x: 6, y: 0, w: 6, h: 4 } },
      { type: "AI_ACTIVITY", position: { x: 0, y: 4, w: 6, h: 4 } },
      { type: "REPORTS", position: { x: 6, y: 4, w: 6, h: 4 } },
    ],
  },
  marketing: {
    label: "Marketing Focused",
    widgets: [
      { type: "AI_ACTIVITY", position: { x: 0, y: 0, w: 8, h: 5 } },
      { type: "NOTES", position: { x: 8, y: 0, w: 4, h: 5 } },
      { type: "UPCOMING_MEETINGS", position: { x: 0, y: 5, w: 6, h: 4 } },
      { type: "REPORTS", position: { x: 6, y: 5, w: 6, h: 4 } },
    ],
  },
};
