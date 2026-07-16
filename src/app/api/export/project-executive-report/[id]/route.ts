import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { renderDocumentToPdf } from "@/lib/documents";
import { computeProjectSpend } from "@/lib/projects/health";
import { computeProjectInsights } from "@/lib/projects/insights";
import { computeResourceUtilization } from "@/lib/projects/analytics";
import { buildExecutiveReportBlueprint } from "@/app/dashboard/projects/[id]/_lib/executive-report-blueprint";

/** Auth-gated, generated-on-demand Executive Report PDF for a project — real metrics only, via the shared Document Engine blueprint/renderer (no persisted document row, no tracking token — this isn't a signable/sent artifact). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await resolveActiveMembership(userId);
  if (!membership) return NextResponse.json({ error: "No organization" }, { status: 404 });

  const { id: projectId } = await params;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { client: { select: { name: true } }, organization: { select: { name: true, logo: true, gstNumber: true, registrationNumber: true, currency: true } } },
  });
  if (!project || project.organizationId !== membership.organizationId) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const [milestones, openRisks, spend, insights, team] = await Promise.all([
    prisma.milestone.findMany({ where: { projectId }, orderBy: { order: "asc" } }),
    prisma.projectRisk.findMany({ where: { projectId, status: "OPEN" }, orderBy: { severity: "desc" } }),
    computeProjectSpend(projectId),
    computeProjectInsights(projectId),
    computeResourceUtilization(project.organizationId, { projectId }),
  ]);

  const blueprint = buildExecutiveReportBlueprint({
    organizationName: project.organization.name,
    logoUrl: project.organization.logo,
    gstNumber: project.organization.gstNumber,
    registrationNumber: project.organization.registrationNumber,
    projectName: project.name,
    projectId: project.id,
    clientName: project.client?.name ?? null,
    status: project.status,
    healthStatus: project.healthStatus,
    progress: project.progress,
    priority: project.priority,
    dueDate: project.dueDate,
    budget: project.budget,
    spend,
    currency: project.organization.currency,
    milestones: milestones.map((m) => ({ name: m.name, status: m.status, dueDate: m.dueDate, clientApproved: !!m.clientApprovedAt })),
    openRisks: openRisks.map((r) => ({ title: r.title, category: r.category, severity: r.severity })),
    team,
    insights,
  });

  const buffer = await renderDocumentToPdf(blueprint);
  const filenameBase = project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filenameBase}-executive-report.pdf"`,
    },
  });
}
