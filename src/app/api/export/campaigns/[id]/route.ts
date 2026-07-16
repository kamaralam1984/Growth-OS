import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { campaignReportToPdfBuffer } from "@/lib/export/outreach-pdf";
import { getCampaignAnalytics } from "@/lib/outreach/campaign-analytics";

/** Auth-gated single-campaign PDF report. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const campaign = await prisma.campaign.findUnique({ where: { id }, include: { _count: { select: { contacts: true } } } });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const membership = await prisma.membership.findUnique({ where: { userId_organizationId: { userId, organizationId: campaign.organizationId } } });
  if (!membership || membership.status !== "ACTIVE") return NextResponse.json({ error: "Not found" }, { status: 404 });

  const analytics = await getCampaignAnalytics(campaign.id);

  const buffer = await campaignReportToPdfBuffer({
    name: campaign.name,
    type: campaign.type,
    status: campaign.status,
    goal: campaign.goal,
    aiPlanNotes: campaign.aiPlanNotes,
    estimatedSuccessPotential: campaign.estimatedSuccessPotential,
    contactsCount: campaign._count.contacts,
    emailsSent: analytics.emailsSent,
    openRate: analytics.openRate,
    clickRate: analytics.clickRate,
    replyRate: analytics.replyRate,
    meetingsBooked: analytics.meetingsBooked,
    bounceRate: analytics.bounceRate,
  });

  const fileBase = campaign.name.replace(/[^a-z0-9]+/gi, "-").slice(0, 60);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileBase}-report.pdf"`,
    },
  });
}
