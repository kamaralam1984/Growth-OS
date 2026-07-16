import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { campaignsToCsv, campaignsToExcelBuffer, type ExportCampaignRow } from "@/lib/export/outreach-export";
import { outreachPerformanceReportToPdfBuffer } from "@/lib/export/outreach-pdf";
import { getCampaignAnalytics } from "@/lib/outreach/campaign-analytics";

const PERIOD_DAYS: Record<string, number | null> = { weekly: 7, monthly: 30, all: null };

// Any unrecognized value falls back to the same default the old
// `?? "..."` + lookup-miss behavior produced — never a 400 here.
const formatSchema = z.enum(["csv", "excel", "pdf"]).catch("csv");
const periodSchema = z.enum(["weekly", "monthly", "all"]).catch("all");

/** Auth-gated bulk campaign export — CSV / Excel / a real org-wide Weekly/Monthly/Performance PDF report. */
export async function GET(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await prisma.membership.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    include: { organization: { select: { name: true } } },
  });
  if (!membership) return NextResponse.json({ error: "No organization" }, { status: 404 });

  const url = new URL(request.url);
  const format = formatSchema.parse(url.searchParams.get("format"));
  const period = periodSchema.parse(url.searchParams.get("period"));
  const dateStamp = new Date().toISOString().slice(0, 10);

  const campaigns = await prisma.campaign.findMany({
    where: { organizationId: membership.organizationId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { contacts: true } } },
  });

  if (format === "pdf") {
    const days = PERIOD_DAYS[period] ?? null;
    const since = days != null ? new Date(Date.now() - days * 86_400_000) : null;
    const scoped = since ? campaigns.filter((c) => c.createdAt >= since) : campaigns;

    const analytics = await Promise.all(scoped.map((c) => getCampaignAnalytics(c.id)));
    const totalReplies = await prisma.reply.count({
      where: { organizationId: membership.organizationId, ...(since ? { receivedAt: { gte: since } } : {}) },
    });
    const totalMeetings = await prisma.outreachMeeting.count({
      where: { organizationId: membership.organizationId, status: { in: ["CONFIRMED", "COMPLETED"] }, ...(since ? { createdAt: { gte: since } } : {}) },
    });

    const buffer = await outreachPerformanceReportToPdfBuffer({
      organizationName: membership.organization.name,
      periodLabel: period === "weekly" ? "Weekly" : period === "monthly" ? "Monthly" : "Performance",
      totalCampaigns: scoped.length,
      totalEmailsSent: analytics.reduce((sum, a) => sum + a.emailsSent, 0),
      totalReplies,
      totalMeetings,
      campaigns: scoped.map((c, i) => ({ name: c.name, status: c.status, emailsSent: analytics[i].emailsSent, openRate: analytics[i].openRate, replyRate: analytics[i].replyRate })),
    });

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="outreach-${period}-report-${dateStamp}.pdf"`,
      },
    });
  }

  const rows: ExportCampaignRow[] = await Promise.all(
    campaigns.map(async (c) => {
      const analytics = await getCampaignAnalytics(c.id);
      return {
        name: c.name,
        type: c.type,
        status: c.status,
        approvalMode: c.approvalMode,
        targetIndustry: c.targetIndustry,
        targetCountry: c.targetCountry,
        estimatedSuccessPotential: c.estimatedSuccessPotential,
        contactsCount: c._count.contacts,
        emailsSent: analytics.emailsSent,
        openRate: analytics.openRate,
        clickRate: analytics.clickRate,
        replyRate: analytics.replyRate,
        meetingsBooked: analytics.meetingsBooked,
        createdAt: c.createdAt,
      };
    }),
  );

  if (format === "excel") {
    const buffer = await campaignsToExcelBuffer(rows);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="campaigns-${dateStamp}.xlsx"`,
      },
    });
  }

  const csv = campaignsToCsv(rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="campaigns-${dateStamp}.csv"`,
    },
  });
}
