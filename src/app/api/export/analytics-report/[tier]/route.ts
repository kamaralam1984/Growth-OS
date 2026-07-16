import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getTieredReport } from "@/lib/reports/tiers";
import { generateReport, REPORT_FORMAT_MIME, REPORT_FORMAT_EXTENSION } from "@/lib/reports/export-service";

const tierSchema = z.enum(["ceo", "board", "investor"]);
const formatSchema = z.enum(["pdf", "pptx", "docx", "json", "csv", "excel"]);

/** Auth-gated, generated-on-demand tiered executive report — mirrors board-report's route exactly: real data via getTieredReport, rendered through the shared Report Export Service (PDF / PPTX / DOCX / JSON / CSV / Excel). */
export async function GET(request: Request, { params }: { params: Promise<{ tier: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await prisma.membership.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) return NextResponse.json({ error: "No organization" }, { status: 404 });

  const { tier } = await params;
  const parsedTier = tierSchema.safeParse(tier);
  if (!parsedTier.success) {
    return NextResponse.json({ error: "Unknown report tier" }, { status: 404 });
  }
  const reportTier = parsedTier.data;

  const url = new URL(request.url);
  const parsedFormat = formatSchema.safeParse(url.searchParams.get("format") ?? "pdf");
  if (!parsedFormat.success) {
    return NextResponse.json({ error: "Unknown report format" }, { status: 400 });
  }
  const format = parsedFormat.data;

  const blueprint = await getTieredReport(membership.organizationId, reportTier);
  const buffer = await generateReport(blueprint, format);
  const dateStamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": REPORT_FORMAT_MIME[format],
      "Content-Disposition": `attachment; filename="${reportTier}-report-${dateStamp}.${REPORT_FORMAT_EXTENSION[format]}"`,
    },
  });
}
