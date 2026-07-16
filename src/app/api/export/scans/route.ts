import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { scansToCsv, scansToExcelBuffer, type ExportScanRow } from "@/lib/export/scan-export";

// Any unrecognized format falls back to CSV, mirroring the previous
// `?? "csv"` + equality-check behavior exactly — never a 400 here.
const formatSchema = z.enum(["csv", "excel"]).catch("csv");

/** Auth-gated bulk website-scan export — CSV / Excel, all real org data. */
export async function GET(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await prisma.membership.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
  if (!membership) return NextResponse.json({ error: "No organization" }, { status: 404 });

  const url = new URL(request.url);
  const format = formatSchema.parse(url.searchParams.get("format"));

  const scans = await prisma.websiteScan.findMany({
    where: { organizationId: membership.organizationId },
    orderBy: { createdAt: "desc" },
    include: { opportunity: { select: { overallOpportunityScore: true, band: true, estimatedValueMin: true, estimatedValueMax: true } } },
  });

  const rows: ExportScanRow[] = scans.map((s) => ({
    url: s.finalUrl ?? s.url,
    websiteName: s.websiteName,
    companyNameInput: s.companyNameInput,
    industryInput: s.industryInput,
    status: s.status,
    overallOpportunityScore: s.opportunity?.overallOpportunityScore ?? null,
    band: s.opportunity?.band ?? null,
    estimatedValueMin: s.opportunity?.estimatedValueMin ?? null,
    estimatedValueMax: s.opportunity?.estimatedValueMax ?? null,
    scannedAt: s.scannedAt,
    createdAt: s.createdAt,
  }));

  const dateStamp = new Date().toISOString().slice(0, 10);

  if (format === "excel") {
    const buffer = await scansToExcelBuffer(rows);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="website-scans-${dateStamp}.xlsx"`,
      },
    });
  }

  const csv = scansToCsv(rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="website-scans-${dateStamp}.csv"`,
    },
  });
}
