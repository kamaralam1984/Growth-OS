import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Container } from "@/components/ui/container";
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AnimatedCounter } from "@/components/ui/animated-counter";
import { formatRelativeTime } from "@/lib/utils";
import type { MeetingStatus, DocumentKind } from "@/generated/prisma/client";

const STATUS_BADGE: Record<MeetingStatus, { label: string; variant: "default" | "secondary" | "outline" | "accent" }> = {
  SCHEDULED: { label: "Scheduled", variant: "outline" },
  LIVE: { label: "Live", variant: "accent" },
  PAUSED: { label: "Paused", variant: "secondary" },
  COMPLETED: { label: "Completed", variant: "secondary" },
  CANCELLED: { label: "Cancelled", variant: "outline" },
};

const DOC_KIND_LABEL: Record<DocumentKind, string> = {
  PROPOSAL: "Proposal",
  QUOTATION: "Quotation",
  CONTRACT: "Contract",
  INVOICE: "Invoice",
  BUSINESS_DOCUMENT: "Document",
};

function startOfToday(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

export default async function ReviewsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=%2Fboard%2Freviews");
  }
  const userId = session.user.id;

  const membership = await prisma.membership.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    include: { organization: true },
  });
  if (!membership) redirect("/onboarding");

  const organizationId = membership.organizationId;
  const todayStart = startOfToday();

  const [reviews, todayCount, pendingCount, approvedCount, rejectedCount, profitAnalyses, recommendationsCount] = await Promise.all([
    prisma.boardReview.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      include: { meeting: { select: { title: true, status: true, createdAt: true } } },
    }),
    prisma.boardReview.count({ where: { organizationId, createdAt: { gte: todayStart } } }),
    prisma.boardReview.count({ where: { organizationId, finalDecision: null } }),
    prisma.boardReview.count({ where: { organizationId, finalDecision: { in: ["APPROVED", "APPROVED_WITH_CHANGES"] } } }),
    prisma.boardReview.count({ where: { organizationId, finalDecision: "REJECTED" } }),
    prisma.profitAnalysis.findMany({ where: { boardReview: { organizationId } }, select: { grossMargin: true } }),
    prisma.recommendation.count({ where: { organizationId, relatedMeetingId: { not: null } } }),
  ]);

  const reviewsWithWinProb = reviews.filter((r) => r.winProbability != null);
  const avgWinRate = reviewsWithWinProb.length > 0 ? reviewsWithWinProb.reduce((sum, r) => sum + (r.winProbability ?? 0), 0) / reviewsWithWinProb.length : null;
  const marginsKnown = profitAnalyses.filter((p) => p.grossMargin != null);
  const avgProfitMargin = marginsKnown.length > 0 ? marginsKnown.reduce((sum, p) => sum + (p.grossMargin ?? 0), 0) / marginsKnown.length : null;

  const stats = [
    { label: "Today's reviews", value: todayCount },
    { label: "Pending reviews", value: pendingCount },
    { label: "Approved", value: approvedCount },
    { label: "Rejected", value: rejectedCount },
  ];

  return (
    <main className="min-h-svh bg-background py-12">
      <Container className="flex flex-col gap-8">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            <ShieldCheck className="size-7 text-primary" /> AI Proposal Review Board
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Before a proposal, quotation, contract, or invoice reaches a client, your CEO, Sales Director, Proposal Expert,
            Finance, Legal, Marketing, CRM, and Analytics agents review it — live, with real reasoning.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.label}>
              <CardContent className="p-6">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{stat.label}</p>
                <AnimatedCounter value={stat.value} className="mt-2 block text-3xl font-semibold tracking-tight text-foreground" />
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="p-6">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Average win rate</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{avgWinRate != null ? `${Math.round(avgWinRate)}%` : "—"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Average profit margin</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{avgProfitMargin != null ? `${Math.round(avgProfitMargin)}%` : "—"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">AI recommendations</p>
              <AnimatedCounter value={recommendationsCount} className="mt-2 block text-3xl font-semibold tracking-tight text-foreground" />
            </CardContent>
          </Card>
        </div>

        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Reviews</h2>
          {reviews.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
                <CardTitle>No reviews yet</CardTitle>
                <CardDescription>
                  Reviews are scheduled automatically when a Proposal, Quotation, Contract, or Invoice is created, or on demand
                  from that document&rsquo;s detail page.
                </CardDescription>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-4">
              {reviews.map((review) => {
                const status = STATUS_BADGE[review.meeting.status];
                return (
                  <Link key={review.id} href={`/board/reviews/${review.id}`} className="group block">
                    <Card className="transition-colors duration-150 group-hover:border-primary/40">
                      <CardContent className="flex flex-col gap-3 py-6">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-semibold text-foreground">{review.meeting.title}</h3>
                            <Badge variant="outline">{DOC_KIND_LABEL[review.docKind]}</Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            {review.finalDecision && <Badge variant="accent">{review.finalDecision.replace(/_/g, " ")}</Badge>}
                            <Badge variant={status.variant}>{status.label}</Badge>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>{formatRelativeTime(review.createdAt)}</span>
                          {review.overallConfidence != null && <span>{Math.round(review.overallConfidence)}% confidence</span>}
                          {review.winProbability != null && <span>{Math.round(review.winProbability)}% win probability</span>}
                          {review.overriddenAt && <span className="text-amber-600 dark:text-amber-400">Overridden by an owner</span>}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </Container>
    </main>
  );
}
