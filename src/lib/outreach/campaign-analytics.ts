import { prisma } from "@/lib/prisma";

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Real daily rollup per campaign — same lazy-upsert-on-view convention as
 * src/lib/analytics.ts's ensureTodaySnapshot (no cron/job runner in this
 * app), so trend charts build real history over time rather than backfilling
 * fake past data points.
 */
export async function ensureTodayCampaignSnapshot(campaignId: string, now: Date = new Date()): Promise<void> {
  const today = startOfDay(now);

  const existing = await prisma.campaignAnalyticsSnapshot.findUnique({ where: { campaignId_date: { campaignId, date: today } } });
  if (existing) return;

  const [emailsSent, opensCount, clicksCount, repliesCount, positiveRepliesCount, meetingsBookedCount, failedCount] = await Promise.all([
    prisma.emailDraft.count({ where: { campaignId, status: "SENT" } }),
    prisma.emailDraft.count({ where: { campaignId, openCount: { gt: 0 } } }),
    prisma.emailDraft.count({ where: { campaignId, clickCount: { gt: 0 } } }),
    prisma.reply.count({ where: { campaignId } }),
    prisma.reply.count({ where: { campaignId, sentiment: "POSITIVE" } }),
    prisma.outreachMeeting.count({ where: { campaignId, status: { in: ["CONFIRMED", "COMPLETED"] } } }),
    prisma.emailDraft.count({ where: { campaignId, status: "FAILED" } }),
  ]);

  await prisma.campaignAnalyticsSnapshot
    .upsert({
      where: { campaignId_date: { campaignId, date: today } },
      create: { campaignId, date: today, emailsSent, opensCount, clicksCount, repliesCount, positiveRepliesCount, meetingsBookedCount, failedCount },
      update: {},
    })
    .catch(() => {
      // Benign race under concurrent requests.
    });
}

export interface CampaignAnalytics {
  emailsSent: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  positiveReplies: number;
  meetingsBooked: number;
  bounceRate: number;
}

/** Real, on-the-fly aggregation — every rate is sentCount-derived, never estimated. Bounce rate is honestly limited to real SMTP-level send failures (no ESP bounce webhook configured). */
export async function getCampaignAnalytics(campaignId: string): Promise<CampaignAnalytics> {
  const [emailsSent, opened, clicked, repliesCount, positiveReplies, meetingsBooked, failed] = await Promise.all([
    prisma.emailDraft.count({ where: { campaignId, status: "SENT" } }),
    prisma.emailDraft.count({ where: { campaignId, openCount: { gt: 0 } } }),
    prisma.emailDraft.count({ where: { campaignId, clickCount: { gt: 0 } } }),
    prisma.reply.count({ where: { campaignId } }),
    prisma.reply.count({ where: { campaignId, sentiment: "POSITIVE" } }),
    prisma.outreachMeeting.count({ where: { campaignId, status: { in: ["CONFIRMED", "COMPLETED"] } } }),
    prisma.emailDraft.count({ where: { campaignId, status: "FAILED" } }),
  ]);

  const attempted = emailsSent + failed;
  return {
    emailsSent,
    openRate: emailsSent > 0 ? Math.round((opened / emailsSent) * 100) : 0,
    clickRate: emailsSent > 0 ? Math.round((clicked / emailsSent) * 100) : 0,
    replyRate: emailsSent > 0 ? Math.round((repliesCount / emailsSent) * 100) : 0,
    positiveReplies,
    meetingsBooked,
    bounceRate: attempted > 0 ? Math.round((failed / attempted) * 100) : 0,
  };
}

export interface CampaignTrendPoint {
  date: string;
  emailsSent: number;
  opensCount: number;
  clicksCount: number;
  repliesCount: number;
}

export async function getCampaignTrend(campaignId: string, days = 30): Promise<CampaignTrendPoint[]> {
  const since = startOfDay(new Date(Date.now() - days * 86_400_000));
  const snapshots = await prisma.campaignAnalyticsSnapshot.findMany({
    where: { campaignId, date: { gte: since } },
    orderBy: { date: "asc" },
  });
  return snapshots.map((s) => ({
    date: s.date.toISOString(),
    emailsSent: s.emailsSent,
    opensCount: s.opensCount,
    clicksCount: s.clicksCount,
    repliesCount: s.repliesCount,
  }));
}

export interface OutreachDashboardStats {
  campaigns: number;
  emailsPrepared: number;
  replies: number;
  meetings: number;
  interested: number;
  notInterested: number;
  pending: number;
  tasks: number;
}

/** Real counts for the Outreach Dashboard stats strip — mirrors getScanStats/getCompanyStats. */
export async function getOutreachDashboardStats(organizationId: string): Promise<OutreachDashboardStats> {
  const [campaigns, emailsPrepared, replies, meetings, interested, notInterested, pending, tasks] = await Promise.all([
    prisma.campaign.count({ where: { organizationId } }),
    prisma.emailDraft.count({ where: { organizationId } }),
    prisma.reply.count({ where: { organizationId } }),
    prisma.outreachMeeting.count({ where: { organizationId, status: { in: ["CONFIRMED", "COMPLETED"] } } }),
    prisma.contact.count({ where: { organizationId, status: "INTERESTED" } }),
    prisma.contact.count({ where: { organizationId, status: "NOT_INTERESTED" } }),
    prisma.emailDraft.count({ where: { organizationId, status: { in: ["DRAFT", "PENDING_APPROVAL", "APPROVED", "QUEUED"] } } }),
    prisma.task.count({ where: { organizationId, contactId: { not: null }, status: { not: "COMPLETED" } } }),
  ]);

  return { campaigns, emailsPrepared, replies, meetings, interested, notInterested, pending, tasks };
}
