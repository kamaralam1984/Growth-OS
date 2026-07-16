import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { rowsToCsv, rowsToExcelBuffer, rowsToPdfBuffer, type ExportColumn } from "@/lib/export/crm-table";
import { computeProjectSpend } from "@/lib/projects/health";

const reportTypeSchema = z.enum(["weekly", "monthly", "team", "budget", "time"]);
type ReportType = z.infer<typeof reportTypeSchema>;

// Any unrecognized format falls back to CSV, mirroring the previous
// `?? "csv"` + equality-check behavior exactly — never a 400 here.
const formatSchema = z.enum(["csv", "excel", "pdf"]).catch("csv");

const querySchema = z.object({ projectId: z.string().trim().min(1, "projectId is required") });

const REPORT_TITLES: Record<ReportType, string> = {
  weekly: "Weekly Status Report",
  monthly: "Monthly Status Report",
  team: "Team Report",
  budget: "Budget Report",
  time: "Time Report",
};

type Row = Record<string, string | number | null>;

async function buildReport(type: ReportType, projectId: string): Promise<{ columns: Array<ExportColumn<Row>>; rows: Row[] }> {
  if (type === "weekly" || type === "monthly") {
    const days = type === "weekly" ? 7 : 30;
    const since = new Date(Date.now() - days * 86_400_000);
    const changes = await prisma.taskStatusChange.findMany({
      where: { task: { projectId }, changedAt: { gte: since } },
      include: { task: { select: { title: true } } },
      orderBy: { changedAt: "desc" },
    });
    return {
      columns: [
        { header: "Task", key: "task", width: 32, value: (r) => r.task },
        { header: "From", key: "from", width: 16, value: (r) => r.from },
        { header: "To", key: "to", width: 16, value: (r) => r.to },
        { header: "Date", key: "date", width: 16, value: (r) => r.date },
      ],
      rows: changes.map((c) => ({ task: c.task.title, from: c.fromStatus ?? "(created)", to: c.toStatus, date: c.changedAt.toISOString().slice(0, 10) })),
    };
  }

  if (type === "team") {
    const members = await prisma.projectMember.findMany({ where: { projectId }, include: { user: { select: { name: true, email: true } } } });
    const rows: Row[] = [];
    for (const m of members) {
      const [openTasks, hoursAgg] = await Promise.all([
        prisma.task.count({ where: { projectId, assignedToUserId: m.userId, status: { notIn: ["COMPLETED", "ARCHIVED", "CANCELLED"] as never[] } } }),
        prisma.task.aggregate({ where: { projectId, assignedToUserId: m.userId }, _sum: { estimatedHours: true, actualHours: true } }),
      ]);
      rows.push({
        name: m.user.name ?? m.user.email ?? "Team member",
        role: m.role,
        openTasks,
        estimatedHours: hoursAgg._sum.estimatedHours ?? 0,
        actualHours: hoursAgg._sum.actualHours ?? 0,
        capacityPerWeek: m.capacityHoursPerWeek ?? "",
      });
    }
    return {
      columns: [
        { header: "Name", key: "name", width: 24, value: (r) => r.name },
        { header: "Role", key: "role", width: 16, value: (r) => r.role },
        { header: "Open Tasks", key: "openTasks", width: 12, value: (r) => r.openTasks },
        { header: "Estimated Hours", key: "estimatedHours", width: 14, value: (r) => r.estimatedHours },
        { header: "Actual Hours", key: "actualHours", width: 14, value: (r) => r.actualHours },
        { header: "Capacity/Week", key: "capacityPerWeek", width: 14, value: (r) => r.capacityPerWeek },
      ],
      rows,
    };
  }

  if (type === "budget") {
    const [project, members, spend] = await Promise.all([
      prisma.project.findUnique({ where: { id: projectId }, select: { budget: true } }),
      prisma.projectMember.findMany({ where: { projectId }, include: { user: { select: { name: true, email: true } } } }),
      computeProjectSpend(projectId),
    ]);
    const rows: Row[] = [];
    for (const m of members) {
      const entries = await prisma.timeEntry.findMany({ where: { projectId, userId: m.userId, billable: true }, select: { durationMinutes: true } });
      const hours = entries.reduce((sum, e) => sum + (e.durationMinutes ?? 0) / 60, 0);
      rows.push({ name: m.user.name ?? m.user.email ?? "Team member", hoursLogged: Number(hours.toFixed(2)), rate: m.hourlyRate ?? 0, spend: Number((hours * (m.hourlyRate ?? 0)).toFixed(2)) });
    }
    rows.push({ name: "TOTAL", hoursLogged: "", rate: "", spend: Number(spend.toFixed(2)) });
    rows.push({ name: "BUDGET", hoursLogged: "", rate: "", spend: project?.budget ?? "" });
    return {
      columns: [
        { header: "Name", key: "name", width: 24, value: (r) => r.name },
        { header: "Hours Logged", key: "hoursLogged", width: 14, value: (r) => r.hoursLogged },
        { header: "Rate", key: "rate", width: 12, value: (r) => r.rate },
        { header: "Spend", key: "spend", width: 14, value: (r) => r.spend },
      ],
      rows,
    };
  }

  // time
  const entries = await prisma.timeEntry.findMany({
    where: { projectId },
    include: { user: { select: { name: true, email: true } }, task: { select: { title: true } } },
    orderBy: { startedAt: "desc" },
    take: 1000,
  });
  return {
    columns: [
      { header: "User", key: "user", width: 20, value: (r) => r.user },
      { header: "Task", key: "task", width: 28, value: (r) => r.task },
      { header: "Date", key: "date", width: 16, value: (r) => r.date },
      { header: "Duration (h)", key: "duration", width: 14, value: (r) => r.duration },
      { header: "Billable", key: "billable", width: 10, value: (r) => r.billable },
      { header: "Source", key: "source", width: 10, value: (r) => r.source },
    ],
    rows: entries.map((e) => ({
      user: e.user.name ?? e.user.email ?? "",
      task: e.task?.title ?? "",
      date: e.startedAt.toISOString().slice(0, 10),
      duration: e.durationMinutes != null ? Number((e.durationMinutes / 60).toFixed(2)) : "",
      billable: e.billable ? "Yes" : "No",
      source: e.source,
    })),
  };
}

/** Auth-gated project report export — Weekly / Monthly / Team / Budget / Time, CSV / Excel / PDF. Mirrors src/app/api/export/crm-report/[type]/route.ts's pattern exactly. */
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
  const parsedQuery = querySchema.safeParse({ projectId: url.searchParams.get("projectId") });
  if (!parsedQuery.success) {
    return NextResponse.json({ error: parsedQuery.error.issues[0]?.message ?? "projectId is required" }, { status: 400 });
  }
  const { projectId } = parsedQuery.data;

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, organizationId: true, name: true } });
  if (!project || project.organizationId !== membership.organizationId) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { columns, rows } = await buildReport(reportType, projectId);
  const dateStamp = new Date().toISOString().slice(0, 10);
  const filenameBase = `${project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${reportType}-report-${dateStamp}`;

  if (format === "excel") {
    const buffer = await rowsToExcelBuffer(rows, columns, REPORT_TITLES[reportType]);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filenameBase}.xlsx"`,
      },
    });
  }

  if (format === "pdf") {
    const buffer = await rowsToPdfBuffer(rows, columns, `${project.name} — ${REPORT_TITLES[reportType]}`, membership.organization.name);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filenameBase}.pdf"`,
      },
    });
  }

  const csv = rowsToCsv(rows, columns);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filenameBase}.csv"`,
    },
  });
}
