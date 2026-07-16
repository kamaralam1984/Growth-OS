import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { withApiKeyAuth } from "@/lib/auth/with-api-key-auth";
import { rowsToCsv, rowsToExcelBuffer, rowsToPdfBuffer, type ExportColumn } from "@/lib/export/crm-table";

// Any unrecognized format falls back to CSV, mirroring the previous
// `?? "csv"` + equality-check behavior exactly — never a 400 here.
const formatSchema = z.enum(["csv", "excel", "pdf"]).catch("csv");

interface DealExportRow {
  name: string;
  stage: string;
  value: number | null;
  probability: number | null;
  priority: string;
  owner: string;
  company: string;
  expectedCloseDate: string;
  createdAt: string;
}

const COLUMNS: Array<ExportColumn<DealExportRow>> = [
  { header: "Deal Name", key: "name", width: 28, value: (r) => r.name },
  { header: "Stage", key: "stage", width: 16, value: (r) => r.stage },
  { header: "Value", key: "value", width: 14, value: (r) => r.value },
  { header: "Probability", key: "probability", width: 12, value: (r) => r.probability },
  { header: "Priority", key: "priority", width: 12, value: (r) => r.priority },
  { header: "Owner", key: "owner", width: 20, value: (r) => r.owner },
  { header: "Company", key: "company", width: 24, value: (r) => r.company },
  { header: "Expected Close", key: "expectedCloseDate", width: 16, value: (r) => r.expectedCloseDate },
  { header: "Created At", key: "createdAt", width: 16, value: (r) => r.createdAt },
];

/** Auth-gated bulk Deal export — CSV / Excel / PDF, all real org data. Session cookie or `Authorization: Bearer <key>` with the `export:deals:read` scope. */
async function exportDeals(request: Request, organizationId: string, organizationName: string): Promise<NextResponse> {
  const url = new URL(request.url);
  const format = formatSchema.parse(url.searchParams.get("format"));

  const deals = await prisma.deal.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    include: { dealStage: { select: { name: true } }, owner: { select: { name: true, email: true } }, company: { select: { name: true } } },
  });

  const rows: DealExportRow[] = deals.map((d) => ({
    name: d.name,
    stage: d.dealStage.name,
    value: d.value,
    probability: d.probability,
    priority: d.priority,
    owner: d.owner?.name ?? d.owner?.email ?? "",
    company: d.company?.name ?? "",
    expectedCloseDate: d.expectedCloseDate ? d.expectedCloseDate.toISOString().slice(0, 10) : "",
    createdAt: d.createdAt.toISOString().slice(0, 10),
  }));

  const dateStamp = new Date().toISOString().slice(0, 10);

  if (format === "excel") {
    const buffer = await rowsToExcelBuffer(rows, COLUMNS, "Deals");
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="deals-${dateStamp}.xlsx"`,
      },
    });
  }

  if (format === "pdf") {
    const buffer = await rowsToPdfBuffer(rows, COLUMNS, "Deals", organizationName);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="deals-${dateStamp}.pdf"`,
      },
    });
  }

  const csv = rowsToCsv(rows, COLUMNS);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="deals-${dateStamp}.csv"`,
    },
  });
}

const getWithApiKey = withApiKeyAuth("export:deals:read", async (request, apiKeyAuth) => {
  const organization = await prisma.organization.findUnique({
    where: { id: apiKeyAuth.organizationId },
    select: { name: true },
  });
  return exportDeals(request, apiKeyAuth.organizationId, organization?.name ?? "");
});

export async function GET(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;

  if (userId) {
    const membership = await resolveActiveMembership(userId);
    if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return exportDeals(request, membership.organizationId, membership.organization.name);
  }

  return getWithApiKey(request);
}
