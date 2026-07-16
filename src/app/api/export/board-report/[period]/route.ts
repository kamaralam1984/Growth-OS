import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getPeriodReport, getAgentProductivity } from "@/lib/reports";
import { generateReport, REPORT_FORMAT_MIME, REPORT_FORMAT_EXTENSION } from "@/lib/reports/export-service";
import { buildBoardReportBlueprint } from "@/app/board/reports/_lib/export-blueprint";

const periodSchema = z.enum(["daily", "weekly", "monthly", "quarterly", "yearly"]);
const formatSchema = z.enum(["pdf", "pptx", "docx", "json", "csv", "excel"]);

/** Auth-gated, generated-on-demand Board Report export — reuses the exact same getPeriodReport/getAgentProductivity data already shown on /board/reports, rendered through the shared Report Export Service (PDF / PPTX / DOCX / JSON / CSV / Excel). */
export async function GET(request: Request, { params }: { params: Promise<{ period: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await prisma.membership.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    include: { organization: { select: { name: true, logo: true, gstNumber: true, registrationNumber: true } } },
  });
  if (!membership) return NextResponse.json({ error: "No organization" }, { status: 404 });

  const { period } = await params;
  const parsedPeriod = periodSchema.safeParse(period);
  if (!parsedPeriod.success) {
    return NextResponse.json({ error: "Unknown report period" }, { status: 404 });
  }
  const reportPeriod = parsedPeriod.data;

  const url = new URL(request.url);
  const parsedFormat = formatSchema.safeParse(url.searchParams.get("format") ?? "pdf");
  if (!parsedFormat.success) {
    return NextResponse.json({ error: "Unknown report format" }, { status: 400 });
  }
  const format = parsedFormat.data;

  const [report, agents] = await Promise.all([
    getPeriodReport(membership.organizationId, reportPeriod),
    getAgentProductivity(membership.organizationId),
  ]);

  const blueprint = buildBoardReportBlueprint(report, agents, {
    organizationName: membership.organization.name,
    logoUrl: membership.organization.logo,
    gstNumber: membership.organization.gstNumber,
    registrationNumber: membership.organization.registrationNumber,
  });

  const buffer = await generateReport(blueprint, format);
  const dateStamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": REPORT_FORMAT_MIME[format],
      "Content-Disposition": `attachment; filename="board-report-${reportPeriod}-${dateStamp}.${REPORT_FORMAT_EXTENSION[format]}"`,
    },
  });
}
