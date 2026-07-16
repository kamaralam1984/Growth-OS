import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { rowsToCsv, rowsToExcelBuffer, rowsToPdfBuffer, type ExportColumn } from "@/lib/export/crm-table";
import { getTeamWorkspace } from "@/app/dashboard/crm/_lib/team-actions";

const reportTypeSchema = z.enum(["pipeline", "sales", "revenue", "task", "activity", "performance"]);
type ReportType = z.infer<typeof reportTypeSchema>;

// Any unrecognized format falls back to CSV, mirroring the previous
// `?? "csv"` + equality-check behavior exactly — never a 400 here.
const formatSchema = z.enum(["csv", "excel", "pdf"]).catch("csv");

const REPORT_TITLES: Record<ReportType, string> = {
  pipeline: "Pipeline Report",
  sales: "Sales Report",
  revenue: "Revenue Report",
  task: "Task Report",
  activity: "Activity Report",
  performance: "Performance Report",
};

async function buildReport(type: ReportType, organizationId: string): Promise<{ columns: Array<ExportColumn<Record<string, string | number | null>>>; rows: Array<Record<string, string | number | null>> }> {
  if (type === "pipeline") {
    const deals = await prisma.deal.findMany({
      where: { organizationId, dealStage: { name: { notIn: ["Won", "Lost", "Archived"] } } },
      include: { dealStage: { select: { name: true } }, owner: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
    return {
      columns: [
        { header: "Deal Name", key: "name", width: 28, value: (r) => r.name },
        { header: "Stage", key: "stage", width: 16, value: (r) => r.stage },
        { header: "Value", key: "value", width: 14, value: (r) => r.value },
        { header: "Probability", key: "probability", width: 12, value: (r) => r.probability },
        { header: "Owner", key: "owner", width: 20, value: (r) => r.owner },
      ],
      rows: deals.map((d) => ({ name: d.name, stage: d.dealStage.name, value: d.value, probability: d.probability, owner: d.owner?.name ?? "" })),
    };
  }

  if (type === "sales") {
    const deals = await prisma.deal.findMany({
      where: { organizationId, dealStage: { name: { in: ["Won", "Lost"] } } },
      include: { dealStage: { select: { name: true } }, owner: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
    });
    return {
      columns: [
        { header: "Deal Name", key: "name", width: 28, value: (r) => r.name },
        { header: "Outcome", key: "outcome", width: 12, value: (r) => r.outcome },
        { header: "Value", key: "value", width: 14, value: (r) => r.value },
        { header: "Owner", key: "owner", width: 20, value: (r) => r.owner },
        { header: "Closed (approx.)", key: "closedAt", width: 16, value: (r) => r.closedAt },
      ],
      rows: deals.map((d) => ({
        name: d.name,
        outcome: d.dealStage.name,
        value: d.value,
        owner: d.owner?.name ?? "",
        closedAt: d.updatedAt.toISOString().slice(0, 10),
      })),
    };
  }

  if (type === "revenue") {
    const deals = await prisma.deal.findMany({
      where: { organizationId, dealStage: { name: "Won" } },
      include: { company: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
    });
    return {
      columns: [
        { header: "Deal Name", key: "name", width: 28, value: (r) => r.name },
        { header: "Value", key: "value", width: 14, value: (r) => r.value },
        { header: "Company", key: "company", width: 24, value: (r) => r.company },
        { header: "Won (approx.)", key: "wonAt", width: 16, value: (r) => r.wonAt },
      ],
      rows: deals.map((d) => ({ name: d.name, value: d.value, company: d.company?.name ?? "", wonAt: d.updatedAt.toISOString().slice(0, 10) })),
    };
  }

  if (type === "task") {
    const tasks = await prisma.task.findMany({
      where: { organizationId },
      include: { assignedToUser: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return {
      columns: [
        { header: "Title", key: "title", width: 32, value: (r) => r.title },
        { header: "Status", key: "status", width: 14, value: (r) => r.status },
        { header: "Priority", key: "priority", width: 12, value: (r) => r.priority },
        { header: "Due Date", key: "dueDate", width: 16, value: (r) => r.dueDate },
        { header: "Assignee", key: "assignee", width: 20, value: (r) => r.assignee },
      ],
      rows: tasks.map((t) => ({
        title: t.title,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : "",
        assignee: t.assignedToUser?.name ?? "",
      })),
    };
  }

  if (type === "activity") {
    const activities = await prisma.activity.findMany({
      where: { organizationId },
      include: { actorUser: { select: { name: true } }, actorAgent: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return {
      columns: [
        { header: "Description", key: "description", width: 48, value: (r) => r.description },
        { header: "Type", key: "type", width: 16, value: (r) => r.type },
        { header: "Actor", key: "actor", width: 20, value: (r) => r.actor },
        { header: "Date", key: "date", width: 16, value: (r) => r.date },
      ],
      rows: activities.map((a) => ({
        description: a.description,
        type: a.type,
        actor: a.actorUser?.name ?? a.actorAgent?.name ?? "",
        date: a.createdAt.toISOString().slice(0, 10),
      })),
    };
  }

  // performance
  const workload = await getTeamWorkspace(organizationId);
  return {
    columns: [
      { header: "Name", key: "name", width: 24, value: (r) => r.name },
      { header: "Role", key: "role", width: 14, value: (r) => r.role },
      { header: "Open Deals", key: "openDeals", width: 12, value: (r) => r.openDeals },
      { header: "Open Deals Value", key: "openDealsValue", width: 16, value: (r) => r.openDealsValue },
      { header: "Open Tasks", key: "openTasks", width: 12, value: (r) => r.openTasks },
    ],
    rows: workload.map((w) => ({
      name: w.name ?? w.email ?? "",
      role: w.role,
      openDeals: w.openDealsCount,
      openDealsValue: w.openDealsValue,
      openTasks: w.openTasksCount,
    })),
  };
}

/** Auth-gated CRM report export — Pipeline / Sales / Revenue / Task / Activity / Performance, CSV / Excel / PDF. */
export async function GET(request: Request, { params }: { params: Promise<{ type: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await prisma.membership.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    include: { organization: { select: { name: true } } },
  });
  if (!membership) return NextResponse.json({ error: "No organization" }, { status: 404 });

  const { type } = await params;
  const parsedType = reportTypeSchema.safeParse(type);
  if (!parsedType.success) {
    return NextResponse.json({ error: "Unknown report type" }, { status: 404 });
  }
  const reportType = parsedType.data;

  const url = new URL(request.url);
  const format = formatSchema.parse(url.searchParams.get("format"));

  const { columns, rows } = await buildReport(reportType, membership.organizationId);
  const dateStamp = new Date().toISOString().slice(0, 10);

  if (format === "excel") {
    const buffer = await rowsToExcelBuffer(rows, columns, REPORT_TITLES[reportType]);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${reportType}-report-${dateStamp}.xlsx"`,
      },
    });
  }

  if (format === "pdf") {
    const buffer = await rowsToPdfBuffer(rows, columns, REPORT_TITLES[reportType], membership.organization.name);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${reportType}-report-${dateStamp}.pdf"`,
      },
    });
  }

  const csv = rowsToCsv(rows, columns);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${reportType}-report-${dateStamp}.csv"`,
    },
  });
}
