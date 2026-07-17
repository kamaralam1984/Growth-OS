import { prisma } from "@/lib/prisma";
import type { Prisma, WidgetType, DashboardTemplate } from "@/generated/prisma/client";
import type { DashboardPackManifest } from "../manifest-schema";

export interface DashboardPackInstallResult {
  dashboardTemplateId: string;
}

/**
 * Creates a new org-scoped DashboardTemplate row, same shape as
 * saveDashboardAsTemplate() (src/lib/dashboard.ts) — serves both the
 * DASHBOARD_PACK and ANALYTICS_PACK marketplace categories (same
 * underlying model; which WidgetTypes the manifest contains is what
 * differentiates a "dashboard" pack from an "analytics" one).
 */
export async function installDashboardPack(organizationId: string, manifest: DashboardPackManifest, createdByUserId: string): Promise<DashboardPackInstallResult> {
  const widgets = manifest.widgets.map((w) => ({ type: w.type as WidgetType, position: w.position }));

  const template: DashboardTemplate = await prisma.dashboardTemplate.create({
    data: {
      organizationId,
      createdByUserId,
      name: manifest.templateName,
      widgets: widgets as unknown as Prisma.InputJsonValue,
    },
  });

  return { dashboardTemplateId: template.id };
}

export async function uninstallDashboardPack(dashboardTemplateId: string): Promise<void> {
  await prisma.dashboardTemplate.delete({ where: { id: dashboardTemplateId } });
}
