"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { AINotConnectedError, AIBillingError, isAIBillingError } from "@/lib/ai/client";
import {
  addWidget,
  removeWidget,
  updateWidgetPositions,
  updateWidgetNotes,
  updateWidgetWeatherCity,
  getOrCreateDefaultDashboard,
  listUserDashboards,
  createDashboard,
  deleteDashboard,
  saveDashboardAsTemplate,
  deleteDashboardTemplate,
  type WidgetPosition,
  type TemplateWidget,
} from "@/lib/dashboard";
import { generateExecutiveInsights, getRecentInsights } from "@/lib/ai/insights-generator";
import {
  addWidgetSchema,
  widgetPositionSchema,
  widgetNotesSchema,
  widgetWeatherConfigSchema,
  saveDashboardTemplateSchema,
} from "@/lib/validations/command-center";
import { ACTIVE_DASHBOARD_COOKIE, DASHBOARD_TEMPLATES } from "@/lib/dashboard-templates";
import type { Dashboard, DashboardTemplate, Insight, Widget, WidgetType } from "@/generated/prisma/client";

export interface DashboardActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Shared auth + active-org resolution for every action in this file. Mirrors
 * the pattern in src/components/command-center/actions.ts and
 * src/app/board/tasks/actions.ts: identity/org are always derived from the
 * session, never trusted from the client.
 */
async function requireSession(): Promise<{ userId: string; organizationId: string } | { error: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { error: "You must be signed in." };

  const membership = await prisma.membership.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) return { error: "You don't belong to an organization yet." };

  return { userId, organizationId: membership.organizationId };
}

// ============================= Widgets =============================

export interface AddWidgetActionResult extends DashboardActionResult {
  widget?: Widget;
}

/** Adds a widget to the caller's default dashboard, creating that dashboard first if it doesn't exist yet. */
export async function addWidgetAction(type: WidgetType, position: WidgetPosition): Promise<AddWidgetActionResult> {
  const session = await requireSession();
  if ("error" in session) return { ok: false, error: session.error };

  const parsed = addWidgetSchema.safeParse({ type, position });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid widget." };
  }

  try {
    const dashboard = await getOrCreateDefaultDashboard(session.userId, session.organizationId);
    const widget = await addWidget(dashboard.id, parsed.data.type, parsed.data.position, session.userId);

    await logAudit({
      userId: session.userId,
      organizationId: session.organizationId,
      action: "dashboard.widget_added",
      metadata: { widgetId: widget.id, type: widget.type },
    });

    revalidatePath("/dashboard");
    return { ok: true, widget };
  } catch (error) {
    console.error("[dashboard] addWidgetAction failed:", error);
    return { ok: false, error: "Something went wrong adding that widget. Please try again." };
  }
}

/** Removes a widget the caller owns (ownership verified via dashboard.userId). */
export async function removeWidgetAction(widgetId: string): Promise<DashboardActionResult> {
  const session = await requireSession();
  if ("error" in session) return { ok: false, error: session.error };

  try {
    await removeWidget(widgetId, session.userId);
    await logAudit({
      userId: session.userId,
      organizationId: session.organizationId,
      action: "dashboard.widget_removed",
      metadata: { widgetId },
    });
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (error) {
    console.error("[dashboard] removeWidgetAction failed:", error);
    return { ok: false, error: error instanceof Error ? error.message : "Could not remove that widget." };
  }
}

/**
 * Bulk-persists widget positions after a drag/resize. Deliberately does NOT
 * call revalidatePath — the grid already reflects the new layout optimistically
 * on the client, and revalidating here would cause a full server refetch/jank
 * mid-drag-session for every position update.
 */
export async function updateWidgetPositionsAction(
  updates: Array<{ id: string; position: WidgetPosition }>,
): Promise<DashboardActionResult> {
  const session = await requireSession();
  if ("error" in session) return { ok: false, error: session.error };

  const parsed = updates.map((u) => ({ id: u.id, position: widgetPositionSchema.safeParse(u.position) }));
  if (parsed.some((u) => !u.position.success)) {
    return { ok: false, error: "Invalid widget position." };
  }

  try {
    await updateWidgetPositions(
      parsed.map((u) => ({ id: u.id, position: (u.position as { success: true; data: WidgetPosition }).data })),
      session.userId,
    );
    return { ok: true };
  } catch (error) {
    console.error("[dashboard] updateWidgetPositionsAction failed:", error);
    return { ok: false, error: "Could not save the new layout. Please try again." };
  }
}

/**
 * Autosaves NOTES widget free-form text into `Widget.config.text`. Called on
 * a debounce and on blur from a live textarea, so — like
 * updateWidgetPositionsAction above — it deliberately does NOT call
 * revalidatePath: this route's data doesn't need to react to the note text,
 * and revalidating on every autosave would refetch the whole dashboard mid-
 * typing. For the same "high-frequency, not a structural change" reasoning
 * updateWidgetPositionsAction already established, this also skips
 * logAudit — an audit entry per debounced keystroke burst would spam the
 * log for something that isn't worth auditing the way add/remove are.
 */
export async function updateWidgetNotesAction(widgetId: string, text: string): Promise<DashboardActionResult> {
  const session = await requireSession();
  if ("error" in session) return { ok: false, error: session.error };

  const parsed = widgetNotesSchema.safeParse({ text });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid note." };
  }

  try {
    await updateWidgetNotes(widgetId, parsed.data.text, session.userId);
    return { ok: true };
  } catch (error) {
    console.error("[dashboard] updateWidgetNotesAction failed:", error);
    return { ok: false, error: error instanceof Error ? error.message : "Could not save that note." };
  }
}

/**
 * Saves the chosen city for a WEATHER widget into `Widget.config.city`.
 * Unlike updateWidgetNotesAction's high-frequency autosave, this is an
 * explicit, infrequent user action (submitting the inline city picker), so
 * — like addWidgetAction/removeWidgetAction — it does call revalidatePath so
 * the widget immediately re-fetches real weather for the new city.
 */
export async function updateWidgetConfigAction(widgetId: string, config: { city: string }): Promise<DashboardActionResult> {
  const session = await requireSession();
  if ("error" in session) return { ok: false, error: session.error };

  const parsed = widgetWeatherConfigSchema.safeParse(config);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid city." };
  }

  try {
    await updateWidgetWeatherCity(widgetId, parsed.data.city, session.userId);
    await logAudit({
      userId: session.userId,
      organizationId: session.organizationId,
      action: "dashboard.widget_config_updated",
      metadata: { widgetId, city: parsed.data.city },
    });
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (error) {
    console.error("[dashboard] updateWidgetConfigAction failed:", error);
    return { ok: false, error: error instanceof Error ? error.message : "Could not update that widget." };
  }
}

// ============================= Executive Insights =============================

export interface InsightsActionResult {
  ok: boolean;
  insights?: Insight[];
  error?: string;
  errorKind?: "not_connected" | "billing" | "generic";
}

function describeInsightsError(error: unknown): InsightsActionResult {
  if (error instanceof AINotConnectedError) {
    return {
      ok: false,
      errorKind: "not_connected",
      error: "AI is not connected — no ANTHROPIC_API_KEY is configured for this environment.",
    };
  }
  if (error instanceof AIBillingError || isAIBillingError(error)) {
    return {
      ok: false,
      errorKind: "billing",
      error: "AI is connected but the account has no API credits — add credits at console.anthropic.com/settings/billing.",
    };
  }
  console.error("[dashboard] insights generation failed:", error);
  return { ok: false, errorKind: "generic", error: "Something went wrong generating insights. Please try again." };
}

/** Real Claude call that (re)generates the Executive Insights panel — rate-limited since it's billable. */
export async function refreshExecutiveInsights(): Promise<InsightsActionResult> {
  const session = await requireSession();
  if ("error" in session) return { ok: false, errorKind: "generic", error: session.error };

  if (!checkRateLimit(`insights:${session.userId}`, { limit: 10, windowMs: 5 * 60_000 }).allowed) {
    return { ok: false, errorKind: "generic", error: "Too many refresh requests — wait a few minutes and try again." };
  }

  try {
    const insights = await generateExecutiveInsights(session.organizationId);
    await logAudit({
      userId: session.userId,
      organizationId: session.organizationId,
      action: "dashboard.insights_refreshed",
      metadata: { count: insights.length },
    });
    revalidatePath("/dashboard");
    return { ok: true, insights };
  } catch (error) {
    return describeInsightsError(error);
  }
}

export async function fetchRecentInsights(): Promise<InsightsActionResult> {
  const session = await requireSession();
  if ("error" in session) return { ok: false, errorKind: "generic", error: session.error };

  try {
    const insights = await getRecentInsights(session.organizationId);
    return { ok: true, insights };
  } catch (error) {
    console.error("[dashboard] fetchRecentInsights failed:", error);
    return { ok: false, errorKind: "generic", error: "Could not load insights." };
  }
}

// ============================= Multiple dashboards =============================

export interface ListDashboardsResult extends DashboardActionResult {
  dashboards?: Dashboard[];
}

export async function listDashboardsAction(): Promise<ListDashboardsResult> {
  const session = await requireSession();
  if ("error" in session) return { ok: false, error: session.error };

  try {
    const dashboards = await listUserDashboards(session.userId, session.organizationId);
    return { ok: true, dashboards };
  } catch (error) {
    console.error("[dashboard] listDashboardsAction failed:", error);
    return { ok: false, error: "Could not load your dashboards." };
  }
}

export interface CreateDashboardResult extends DashboardActionResult {
  dashboardId?: string;
}

/**
 * Creates a new named dashboard, optionally seeded from a built-in
 * DASHBOARD_TEMPLATES preset (`templateKey`) OR an org-saved DashboardTemplate
 * DB row (`customTemplateId`). `customTemplateId` wins if both are passed —
 * callers (the dashboard switcher's picker) only ever send one.
 */
export async function createDashboardAction(
  name: string,
  templateKey?: string,
  customTemplateId?: string,
): Promise<CreateDashboardResult> {
  const session = await requireSession();
  if ("error" in session) return { ok: false, error: session.error };

  try {
    const dashboard = await createDashboard(session.userId, session.organizationId, name);

    let widgetsToSeed: TemplateWidget[] = [];
    if (customTemplateId) {
      const customTemplate = await prisma.dashboardTemplate.findFirst({
        where: { id: customTemplateId, organizationId: session.organizationId },
      });
      if (customTemplate) widgetsToSeed = customTemplate.widgets as unknown as TemplateWidget[];
    } else {
      const template = templateKey ? DASHBOARD_TEMPLATES[templateKey] : undefined;
      if (template) widgetsToSeed = template.widgets;
    }

    for (const w of widgetsToSeed) {
      await addWidget(dashboard.id, w.type, w.position, session.userId);
    }

    await logAudit({
      userId: session.userId,
      organizationId: session.organizationId,
      action: "dashboard.dashboard_created",
      metadata: { dashboardId: dashboard.id, template: templateKey ?? null, customTemplateId: customTemplateId ?? null },
    });

    revalidatePath("/dashboard");
    return { ok: true, dashboardId: dashboard.id };
  } catch (error) {
    console.error("[dashboard] createDashboardAction failed:", error);
    return { ok: false, error: error instanceof Error ? error.message : "Could not create that dashboard." };
  }
}

export async function deleteDashboardAction(dashboardId: string): Promise<DashboardActionResult> {
  const session = await requireSession();
  if ("error" in session) return { ok: false, error: session.error };

  try {
    await deleteDashboard(dashboardId, session.userId);
    await logAudit({
      userId: session.userId,
      organizationId: session.organizationId,
      action: "dashboard.dashboard_deleted",
      metadata: { dashboardId },
    });

    const cookieStore = await cookies();
    if (cookieStore.get(ACTIVE_DASHBOARD_COOKIE)?.value === dashboardId) {
      cookieStore.delete(ACTIVE_DASHBOARD_COOKIE);
    }

    revalidatePath("/dashboard");
    return { ok: true };
  } catch (error) {
    console.error("[dashboard] deleteDashboardAction failed:", error);
    return { ok: false, error: error instanceof Error ? error.message : "Could not delete that dashboard." };
  }
}

/** Persists the chosen dashboard as active for this browser, mirroring setActiveOrganization's cookie pattern. */
export async function setActiveDashboardAction(dashboardId: string): Promise<DashboardActionResult> {
  const session = await requireSession();
  if ("error" in session) return { ok: false, error: session.error };

  const dashboards = await listUserDashboards(session.userId, session.organizationId);
  if (!dashboards.some((d) => d.id === dashboardId)) {
    return { ok: false, error: "You do not have access to that dashboard." };
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_DASHBOARD_COOKIE, dashboardId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath("/dashboard");
  return { ok: true };
}

// ============================= Dashboard templates =============================

export interface ListDashboardTemplatesResult extends DashboardActionResult {
  templates?: DashboardTemplate[];
}

/** Org-saved templates available to seed a new dashboard from, alongside the built-in DASHBOARD_TEMPLATES. */
export async function listDashboardTemplatesAction(): Promise<ListDashboardTemplatesResult> {
  const session = await requireSession();
  if ("error" in session) return { ok: false, error: session.error };

  try {
    const templates = await prisma.dashboardTemplate.findMany({
      where: { organizationId: session.organizationId },
      orderBy: { createdAt: "desc" },
    });
    return { ok: true, templates };
  } catch (error) {
    console.error("[dashboard] listDashboardTemplatesAction failed:", error);
    return { ok: false, error: "Could not load saved templates." };
  }
}

/** Snapshots a dashboard the caller owns into a reusable, org-shared template. */
export async function saveCurrentLayoutAsTemplateAction(
  dashboardId: string,
  name: string,
): Promise<DashboardActionResult> {
  const session = await requireSession();
  if ("error" in session) return { ok: false, error: session.error };

  const parsed = saveDashboardTemplateSchema.safeParse({ name });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid template name." };
  }

  try {
    const template = await saveDashboardAsTemplate(dashboardId, parsed.data.name, session.userId);
    await logAudit({
      userId: session.userId,
      organizationId: session.organizationId,
      action: "dashboard.template_saved",
      metadata: { templateId: template.id, dashboardId, name: template.name },
    });

    revalidatePath("/dashboard");
    return { ok: true };
  } catch (error) {
    console.error("[dashboard] saveCurrentLayoutAsTemplateAction failed:", error);
    return { ok: false, error: error instanceof Error ? error.message : "Could not save that layout as a template." };
  }
}

/** Ownership-checked (org-scoped) delete of a saved template. */
export async function deleteDashboardTemplateAction(templateId: string): Promise<DashboardActionResult> {
  const session = await requireSession();
  if ("error" in session) return { ok: false, error: session.error };

  try {
    await deleteDashboardTemplate(templateId, session.organizationId);
    await logAudit({
      userId: session.userId,
      organizationId: session.organizationId,
      action: "dashboard.template_deleted",
      metadata: { templateId },
    });

    revalidatePath("/dashboard");
    return { ok: true };
  } catch (error) {
    console.error("[dashboard] deleteDashboardTemplateAction failed:", error);
    return { ok: false, error: error instanceof Error ? error.message : "Could not delete that template." };
  }
}
