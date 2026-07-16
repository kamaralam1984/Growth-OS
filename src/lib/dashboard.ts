import { prisma } from "@/lib/prisma";
import type { Dashboard, DashboardTemplate, Prisma, Widget, WidgetType } from "@/generated/prisma/client";

/**
 * react-grid-layout's per-item shape. Stored verbatim in Widget.position
 * (Json) using a 12-column grid convention (x/w in column units, y/h in row
 * units) — the Command Center UI (built elsewhere) is expected to pass this
 * straight to <ResponsiveGridLayout>.
 */
export interface WidgetPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type DashboardWithWidgets = Dashboard & { widgets: Widget[] };

const DEFAULT_DASHBOARD_NAME = "My Dashboard";

/**
 * Starter widget set for a brand-new dashboard: 2 columns x 3 rows on a
 * 12-column grid, no overlaps. TASKS/UPCOMING_MEETINGS/AI_ACTIVITY/REPORTS
 * are the four the brief calls out by name; PIPELINE and REVENUE are added
 * because computePipelineTotals gives them real (if often $0) numbers to
 * show from day one — no widget here is backed by fabricated data.
 */
const STARTER_WIDGETS: ReadonlyArray<{ type: WidgetType; position: WidgetPosition }> = [
  { type: "TASKS", position: { x: 0, y: 0, w: 6, h: 4 } },
  { type: "UPCOMING_MEETINGS", position: { x: 6, y: 0, w: 6, h: 4 } },
  { type: "AI_ACTIVITY", position: { x: 0, y: 4, w: 6, h: 4 } },
  { type: "REPORTS", position: { x: 6, y: 4, w: 6, h: 4 } },
  { type: "PIPELINE", position: { x: 0, y: 8, w: 6, h: 4 } },
  { type: "REVENUE", position: { x: 6, y: 8, w: 6, h: 4 } },
];

function toJson(position: WidgetPosition): Prisma.InputJsonValue {
  return position as unknown as Prisma.InputJsonValue;
}

/**
 * IMPORTANT — ownership pattern used by every function in this file:
 * every mutation/read below is scoped by a real `userId` you must pass in,
 * verified via a join against Dashboard.userId (Widget has no userId of its
 * own, so widget-level checks join through `dashboard: { userId }`). This
 * module never trusts a bare Dashboard/Widget id on its own. Callers
 * (Server Actions) MUST still run their own `auth()` check first and pass
 * the authenticated session's userId in — this module's checks guard against
 * one authenticated user reaching into another user's dashboard, not against
 * an unauthenticated request in the first place.
 */

/**
 * Finds the calling user's default dashboard for this org, or creates one
 * ("My Dashboard", isDefault: true) seeded with the starter widget layout
 * above. Idempotent and safe to call on every Command Center page load.
 */
export async function getOrCreateDefaultDashboard(
  userId: string,
  organizationId: string,
): Promise<DashboardWithWidgets> {
  const existing = await prisma.dashboard.findFirst({
    where: { userId, organizationId, isDefault: true },
    include: { widgets: true },
  });
  if (existing) return existing;

  try {
    return await prisma.dashboard.create({
      data: {
        userId,
        organizationId,
        name: DEFAULT_DASHBOARD_NAME,
        isDefault: true,
        widgets: {
          create: STARTER_WIDGETS.map((w) => ({ type: w.type, position: toJson(w.position) })),
        },
      },
      include: { widgets: true },
    });
  } catch (error) {
    // Race guard: two concurrent first-loads (e.g. two tabs) could both miss
    // the `existing` check above and both attempt to create. The unique
    // [userId, name] constraint means only one create wins; the loser
    // re-fetches instead of throwing a spurious error to the user.
    const isUniqueViolation =
      typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
    if (isUniqueViolation) {
      const created = await prisma.dashboard.findFirst({
        where: { userId, organizationId, isDefault: true },
        include: { widgets: true },
      });
      if (created) return created;
    }
    throw error;
  }
}

/** All dashboards the user owns in this org, default first. */
export async function listUserDashboards(userId: string, organizationId: string): Promise<Dashboard[]> {
  return prisma.dashboard.findMany({
    where: { userId, organizationId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
}

/**
 * Resolves which dashboard the Command Center should render: the requested
 * `dashboardId` if it exists and is owned by this user, otherwise the
 * default dashboard (created on first use). Powers the dashboard switcher —
 * the requested id normally comes from the `activeDashboardId` cookie the
 * switcher sets, mirroring the ACTIVE_ORG_COOKIE pattern.
 */
export async function getActiveDashboard(
  userId: string,
  organizationId: string,
  dashboardId?: string | null,
): Promise<DashboardWithWidgets> {
  if (dashboardId) {
    const dashboard = await prisma.dashboard.findFirst({
      where: { id: dashboardId, userId, organizationId },
      include: { widgets: true },
    });
    if (dashboard) return dashboard;
  }
  return getOrCreateDefaultDashboard(userId, organizationId);
}

/** Creates a new (non-default) named dashboard for the user in this org. */
export async function createDashboard(
  userId: string,
  organizationId: string,
  name: string,
): Promise<Dashboard> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Dashboard name is required.");

  return prisma.dashboard.create({
    data: { userId, organizationId, name: trimmed, isDefault: false },
  });
}

/**
 * Deletes a dashboard the user owns. Ownership-checked (findFirst scoped by
 * userId, not a bare `findUnique(id)`) and refuses to delete a user's last
 * remaining dashboard in the org rather than leaving them with none.
 */
export async function deleteDashboard(dashboardId: string, userId: string): Promise<void> {
  const dashboard = await prisma.dashboard.findFirst({ where: { id: dashboardId, userId } });
  if (!dashboard) throw new Error("Dashboard not found or you do not have access to it.");

  const remaining = await prisma.dashboard.count({
    where: { userId, organizationId: dashboard.organizationId },
  });
  if (remaining <= 1) {
    throw new Error("You can't delete your last remaining dashboard.");
  }

  await prisma.dashboard.delete({ where: { id: dashboardId } });
}

/**
 * Adds a widget to a dashboard the user owns.
 *
 * Deviation from the brief's sketch signature `addWidget(dashboardId, type,
 * position)`: a `userId` parameter is added (last, mirroring
 * deleteDashboard's `(dashboardId, userId)` ordering) because the brief
 * explicitly requires every one of these functions to verify ownership via a
 * passed-in userId rather than trusting a bare id.
 */
export async function addWidget(
  dashboardId: string,
  type: WidgetType,
  position: WidgetPosition,
  userId: string,
): Promise<Widget> {
  const dashboard = await prisma.dashboard.findFirst({ where: { id: dashboardId, userId } });
  if (!dashboard) throw new Error("Dashboard not found or you do not have access to it.");

  return prisma.widget.create({
    data: { dashboardId, type, position: toJson(position) },
  });
}

/**
 * Removes a widget from a dashboard the user owns.
 *
 * Deviation from the brief's sketch signature `removeWidget(widgetId)`: a
 * `userId` parameter is added (same reasoning as addWidget above). Ownership
 * is verified by joining through the parent dashboard since Widget itself
 * has no userId column.
 */
export async function removeWidget(widgetId: string, userId: string): Promise<void> {
  const widget = await prisma.widget.findFirst({ where: { id: widgetId, dashboard: { userId } } });
  if (!widget) throw new Error("Widget not found or you do not have access to it.");

  await prisma.widget.delete({ where: { id: widgetId } });
}

/**
 * Bulk-updates widget positions after a drag/resize, in a single
 * transaction. Every widget id in `updates` must belong (via its dashboard)
 * to `userId`, or the whole call is rejected before any write happens.
 *
 * Deviation from the brief's sketch signature `updateWidgetPositions(updates)`:
 * a `userId` parameter is added (same reasoning as addWidget/removeWidget).
 */
export async function updateWidgetPositions(
  updates: Array<{ id: string; position: WidgetPosition }>,
  userId: string,
): Promise<void> {
  if (updates.length === 0) return;

  const ids = updates.map((u) => u.id);
  const owned = await prisma.widget.findMany({
    where: { id: { in: ids }, dashboard: { userId } },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((w) => w.id));
  const forbidden = ids.filter((id) => !ownedIds.has(id));
  if (forbidden.length > 0) {
    throw new Error("One or more widgets were not found or you do not have access to them.");
  }

  await prisma.$transaction(
    updates.map((u) =>
      prisma.widget.update({ where: { id: u.id }, data: { position: toJson(u.position) } }),
    ),
  );
}

/**
 * Persists free-form note text for a NOTES widget in `Widget.config` as
 * `{ text }`. Deviation from the brief's sketch signature
 * `updateWidgetNotes(widgetId, text)`: a `userId` parameter is added (same
 * reasoning as addWidget/removeWidget/updateWidgetPositions) so ownership is
 * checked here rather than trusted from the caller.
 */
export async function updateWidgetNotes(widgetId: string, text: string, userId: string): Promise<void> {
  const widget = await prisma.widget.findFirst({ where: { id: widgetId, dashboard: { userId } } });
  if (!widget) throw new Error("Widget not found or you do not have access to it.");

  await prisma.widget.update({
    where: { id: widgetId },
    data: { config: { text } as unknown as Prisma.InputJsonValue },
  });
}

/**
 * Persists the chosen city for a WEATHER widget in `Widget.config` as
 * `{ city }` — read back by getWidgetDataBundle (src/app/dashboard/_lib/widget-data.ts)
 * to decide which city to call src/lib/weather.ts's getWeather() for. Same
 * ownership-check shape as updateWidgetNotes above.
 */
export async function updateWidgetWeatherCity(widgetId: string, city: string, userId: string): Promise<void> {
  const widget = await prisma.widget.findFirst({ where: { id: widgetId, dashboard: { userId } } });
  if (!widget) throw new Error("Widget not found or you do not have access to it.");

  await prisma.widget.update({
    where: { id: widgetId },
    data: { config: { city } as unknown as Prisma.InputJsonValue },
  });
}

// ============================= Dashboard templates =============================
//
// User-saved, org-shared reusable layouts (DashboardTemplate DB rows) —
// distinct from the 3 hardcoded DASHBOARD_TEMPLATES presets in
// dashboard-templates.ts. Unlike Dashboard/Widget above, these are scoped by
// `organizationId` rather than `userId`: any member of the org can save,
// list, use, or delete one, mirroring org-wide resources like Company/Deal
// rather than the per-user Dashboard ownership model.

export type TemplateWidget = { type: WidgetType; position: WidgetPosition };

function widgetsToJson(widgets: TemplateWidget[]): Prisma.InputJsonValue {
  return widgets as unknown as Prisma.InputJsonValue;
}

/** All templates saved for this org, newest first. */
export async function listDashboardTemplates(organizationId: string): Promise<DashboardTemplate[]> {
  return prisma.dashboardTemplate.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Snapshots a dashboard the user owns into a reusable, org-shared
 * DashboardTemplate: reads the dashboard's current Widget rows and stores
 * `{ type, position }` for each — `config`/`id` are intentionally dropped,
 * since a template captures a layout shape, not widget-specific saved data
 * (e.g. a NOTES widget's saved text).
 */
export async function saveDashboardAsTemplate(
  dashboardId: string,
  name: string,
  userId: string,
): Promise<DashboardTemplate> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Template name is required.");

  const dashboard = await prisma.dashboard.findFirst({
    where: { id: dashboardId, userId },
    include: { widgets: true },
  });
  if (!dashboard) throw new Error("Dashboard not found or you do not have access to it.");

  const widgets: TemplateWidget[] = dashboard.widgets.map((w) => ({
    type: w.type,
    position: w.position as unknown as WidgetPosition,
  }));

  return prisma.dashboardTemplate.create({
    data: {
      organizationId: dashboard.organizationId,
      createdByUserId: userId,
      name: trimmed,
      widgets: widgetsToJson(widgets),
    },
  });
}

/** Deletes an org-saved template. Ownership-checked: scoped to `organizationId`, not a bare id. */
export async function deleteDashboardTemplate(templateId: string, organizationId: string): Promise<void> {
  const template = await prisma.dashboardTemplate.findFirst({ where: { id: templateId, organizationId } });
  if (!template) throw new Error("Template not found or you do not have access to it.");

  await prisma.dashboardTemplate.delete({ where: { id: templateId } });
}
