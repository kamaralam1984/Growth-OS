import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { rowsToCsv, rowsToExcelBuffer, rowsToPdfBuffer, type ExportColumn } from "@/lib/export/crm-table";

// Any unrecognized format falls back to CSV, mirroring the previous
// `?? "csv"` + equality-check behavior exactly — never a 400 here.
const formatSchema = z.enum(["csv", "excel", "pdf"]).catch("csv");

interface TaskExportRow {
  title: string;
  type: string;
  status: string;
  priority: string;
  dueDate: string;
  assignee: string;
  deal: string;
  createdAt: string;
}

const COLUMNS: Array<ExportColumn<TaskExportRow>> = [
  { header: "Title", key: "title", width: 32, value: (r) => r.title },
  { header: "Type", key: "type", width: 16, value: (r) => r.type },
  { header: "Status", key: "status", width: 14, value: (r) => r.status },
  { header: "Priority", key: "priority", width: 12, value: (r) => r.priority },
  { header: "Due Date", key: "dueDate", width: 16, value: (r) => r.dueDate },
  { header: "Assignee", key: "assignee", width: 20, value: (r) => r.assignee },
  { header: "Deal", key: "deal", width: 24, value: (r) => r.deal },
  { header: "Created At", key: "createdAt", width: 16, value: (r) => r.createdAt },
];

/** Auth-gated bulk Task export — CSV / Excel / PDF, all real org data. */
export async function GET(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await resolveActiveMembership(userId);
  if (!membership) return NextResponse.json({ error: "No organization" }, { status: 404 });

  const url = new URL(request.url);
  const format = formatSchema.parse(url.searchParams.get("format"));

  const tasks = await prisma.task.findMany({
    where: { organizationId: membership.organizationId },
    orderBy: { createdAt: "desc" },
    include: { assignedToUser: { select: { name: true, email: true } }, deal: { select: { name: true } } },
  });

  const rows: TaskExportRow[] = tasks.map((t) => ({
    title: t.title,
    type: t.type ?? "",
    status: t.status,
    priority: t.priority,
    dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : "",
    assignee: t.assignedToUser?.name ?? t.assignedToUser?.email ?? "",
    deal: t.deal?.name ?? "",
    createdAt: t.createdAt.toISOString().slice(0, 10),
  }));

  const dateStamp = new Date().toISOString().slice(0, 10);

  if (format === "excel") {
    const buffer = await rowsToExcelBuffer(rows, COLUMNS, "Tasks");
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="tasks-${dateStamp}.xlsx"`,
      },
    });
  }

  if (format === "pdf") {
    const buffer = await rowsToPdfBuffer(rows, COLUMNS, "Tasks", membership.organization.name);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="tasks-${dateStamp}.pdf"`,
      },
    });
  }

  const csv = rowsToCsv(rows, COLUMNS);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tasks-${dateStamp}.csv"`,
    },
  });
}
