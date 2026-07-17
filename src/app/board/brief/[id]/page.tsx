import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, Sparkles, ShieldAlert, Lightbulb, TrendingUp } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatRelativeTime } from "@/lib/utils";

interface OpportunityItem {
  kind: string;
  title: string;
  value: number | null;
}

interface RevenueForecastShape {
  day: { total: number; confidenceScore: number };
  cashFlowNext4Weeks: number;
}

interface CustomerSuccessStatsShape {
  activeClientsCount: number;
  healthyCount: number;
  needsAttentionCount: number;
  highRiskCount: number;
  totalReferred: number;
  totalConverted: number;
}

export default async function BriefDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=%2Fboard%2Fbrief%2F${id}`);
  }
  const userId = session.user.id;

  const membership = await prisma.membership.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
  if (!membership) {
    redirect("/onboarding");
  }

  const brief = await prisma.executiveBriefing.findUnique({ where: { id } });
  if (!brief || brief.organizationId !== membership.organizationId) {
    notFound();
  }

  const opportunities = (brief.opportunities as unknown as OpportunityItem[] | null) ?? [];
  const isCustomerSuccess = brief.type === "CUSTOMER_SUCCESS";
  const revenueForecast = isCustomerSuccess ? null : (brief.revenueForecast as unknown as RevenueForecastShape);
  const csStats = isCustomerSuccess ? (brief.revenueForecast as unknown as CustomerSuccessStatsShape) : null;

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <Link href="/board/brief" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to Daily Briefs
        </Link>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{brief.type} Executive Briefing</h1>
            <p className="text-sm text-muted-foreground">Generated {formatRelativeTime(brief.createdAt)}</p>
          </div>
          <Badge variant="outline">{brief.type}</Badge>
        </div>

        {brief.narrativeSummary && (
          <Card glass>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="size-4 text-primary" /> Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-foreground">{brief.narrativeSummary}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                AI-composed from the real figures below — never an independent source of numbers.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card glass>
            <CardContent className="p-5">
              <p className="text-xs text-muted-foreground">{isCustomerSuccess ? "Clients needing attention" : "New leads"}</p>
              <p className="text-2xl font-semibold text-foreground">{brief.newLeadsCount}</p>
            </CardContent>
          </Card>
          <Card glass>
            <CardContent className="p-5">
              <p className="text-xs text-muted-foreground">{isCustomerSuccess ? "At high churn risk" : "Pending approvals"}</p>
              <p className="text-2xl font-semibold text-foreground">{brief.pendingApprovalsCount}</p>
            </CardContent>
          </Card>
          {isCustomerSuccess ? (
            <Card glass>
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground">Referral conversions</p>
                <p className="text-2xl font-semibold text-foreground">
                  {csStats?.totalConverted ?? 0}/{csStats?.totalReferred ?? 0}
                </p>
                <p className="text-xs text-muted-foreground">
                  {csStats?.healthyCount ?? 0} healthy · {csStats?.needsAttentionCount ?? 0} needs attention · {csStats?.highRiskCount ?? 0} high risk
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card glass>
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground">Today&apos;s revenue forecast</p>
                <p className="text-2xl font-semibold text-foreground">{revenueForecast?.day?.total?.toFixed(2) ?? "—"}</p>
                <p className="text-xs text-muted-foreground">Confidence {revenueForecast?.day?.confidenceScore ?? "—"}/100</p>
              </CardContent>
            </Card>
          )}
        </div>

        <Card glass>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="size-4" /> Business Opportunities
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {opportunities.length === 0 ? (
              <p className="text-sm text-muted-foreground">No opportunities on record.</p>
            ) : (
              opportunities.map((o, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-foreground">{o.title}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{o.kind}</Badge>
                    {o.value != null && <span className="text-muted-foreground">{o.value.toFixed(2)}</span>}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card glass>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldAlert className="size-4" /> Critical Risks
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {brief.risks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active risks.</p>
              ) : (
                brief.risks.map((r, i) => (
                  <p key={i} className="text-sm text-foreground">
                    {r}
                  </p>
                ))
              )}
            </CardContent>
          </Card>

          <Card glass>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Lightbulb className="size-4" /> Growth Recommendations
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {brief.recommendedActions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recommendations on record.</p>
              ) : (
                brief.recommendedActions.map((a, i) => (
                  <p key={i} className="text-sm text-foreground">
                    {a}
                  </p>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </Container>
    </main>
  );
}
