import Link from "next/link";
import { redirect } from "next/navigation";
import { Gauge, TrendingUp, HeartPulse, ShieldAlert, Lightbulb, Share2, ArrowRight } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/app/dashboard/_lib/format";
import { computeGrowthScore } from "@/lib/growth/score";
import { getRevenueForecast, getCashFlowProjection } from "@/lib/revenue/forecast";
import { getPipelineHealthScore } from "@/lib/pipeline/intelligence";
import { getReferralAttribution } from "@/lib/clients/referral-attribution";
import { getRecentInsights } from "@/lib/ai/insights-generator";
import { getLatestImprovementPlan } from "@/lib/ai/business-analyst-agent";
import { ImprovementPlanPanel, type ImprovementPlanRecommendation } from "./_components/improvement-plan-panel";

const AXIS_LABELS: Record<string, string> = {
  salesScore: "Sales",
  marketingScore: "Marketing",
  customerSuccessScore: "Customer Success",
  operationsScore: "Operations",
  financeScore: "Finance",
  productivityScore: "Productivity",
  aiAdoptionScore: "AI Adoption",
  automationScore: "Automation",
  technologyScore: "Technology",
  customerSatisfactionScore: "Customer Satisfaction",
};

const SEVERITY_CLASS: Record<string, string> = {
  LOW: "border-border bg-transparent text-foreground",
  MEDIUM: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  HIGH: "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400",
  CRITICAL: "border-destructive/30 bg-destructive/10 text-destructive",
};

/**
 * Executive Business Dashboard — pure aggregation, zero new business logic.
 * Every number traces to a lib call built in an earlier phase (Growth
 * Score, Revenue/Cash-Flow Forecast, Pipeline Health, Client Health/Churn,
 * Alerts, Insights, Referral Attribution) — this page proves those engines
 * compose into one leadership view.
 */
export default async function ExecutiveGrowthDashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=%2Fboard%2Fgrowth");
  }
  const userId = session.user.id;

  const membership = await prisma.membership.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    include: { organization: { select: { currency: true } } },
  });
  if (!membership) {
    redirect("/onboarding");
  }
  const organizationId = membership.organizationId;
  const currency = membership.organization.currency;

  const [
    growthScore,
    revenueForecast,
    cashFlow,
    pipelineHealth,
    clientHealthSnapshots,
    churnWatchlist,
    activeAlerts,
    insights,
    referralAttribution,
    improvementPlan,
  ] = await Promise.all([
    computeGrowthScore(organizationId),
    getRevenueForecast(organizationId, "month"),
    getCashFlowProjection(organizationId, 4),
    getPipelineHealthScore(organizationId),
    prisma.clientHealthSnapshot.findMany({
      where: { organizationId },
      orderBy: [{ clientId: "asc" }, { date: "desc" }],
      distinct: ["clientId"],
      select: { classification: true },
    }),
    prisma.churnRiskAssessment.findMany({
      where: { organizationId },
      orderBy: { probabilityScore: "desc" },
      take: 5,
      include: { client: { select: { name: true } } },
    }),
    prisma.alert.findMany({ where: { organizationId, status: "ACTIVE" }, orderBy: { triggeredAt: "desc" }, take: 6 }),
    getRecentInsights(organizationId, 4),
    getReferralAttribution(organizationId),
    getLatestImprovementPlan(organizationId),
  ]);

  const improvementPlanData = improvementPlan
    ? {
        id: improvementPlan.id,
        narrativeSummary: improvementPlan.narrativeSummary,
        recommendations: improvementPlan.recommendations as unknown as ImprovementPlanRecommendation[],
        confidenceScore: improvementPlan.confidenceScore,
        createdAt: improvementPlan.createdAt.toISOString(),
      }
    : null;

  const healthDistribution = { HEALTHY: 0, NEEDS_ATTENTION: 0, HIGH_RISK: 0 };
  for (const s of clientHealthSnapshots) healthDistribution[s.classification] += 1;

  const cashFlowNext4Weeks = cashFlow.reduce((sum, b) => sum + b.expectedInflow, 0);
  const totalReferred = referralAttribution.reduce((sum, r) => sum + r.referredLeadsCount, 0);
  const totalConverted = referralAttribution.reduce((sum, r) => sum + r.convertedCount, 0);

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Executive Business Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Real business metrics only — Growth Score, forecasts, pipeline health, client health, active risks, and
            recommendations, all pulled from the engines built across this app. Deep-dive links go to each engine&apos;s
            own page.
          </p>
        </div>

        <Card glass>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Gauge className="size-4 text-primary" /> Growth Score
            </CardTitle>
            <CardDescription>Composite of 10 axes — reused engines only, no new computation on this page.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-semibold text-foreground">{growthScore.overallScore}</span>
              <span className="text-sm text-muted-foreground">/ 100</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {Object.entries(AXIS_LABELS).map(([field, label]) => {
                const score = (growthScore as unknown as Record<string, number>)[field];
                const confidence = growthScore.axisConfidence[field] ?? 100;
                return (
                  <div key={field}>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-lg font-medium text-foreground">
                      {score}
                      {confidence < 100 && <span className="ml-1 text-xs text-muted-foreground">(no data)</span>}
                    </p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <ImprovementPlanPanel plan={improvementPlanData} />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card glass>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="size-4" /> Revenue (this month)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-foreground">{formatCurrency(revenueForecast.total, currency)}</p>
              <p className="text-xs text-muted-foreground">Confidence {revenueForecast.confidenceScore}/100 · {revenueForecast.expectedClosuresCount} expected closures</p>
              <Link href="/dashboard/analytics" className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline">
                Full forecast <ArrowRight className="size-3" />
              </Link>
            </CardContent>
          </Card>

          <Card glass>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="size-4" /> Cash flow (next 4 weeks)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-foreground">{formatCurrency(cashFlowNext4Weeks, currency)}</p>
              <p className="text-xs text-muted-foreground">Real expected inflow from due invoices + subscription renewals</p>
            </CardContent>
          </Card>

          <Card glass>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Gauge className="size-4" /> Pipeline health
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-foreground">{pipelineHealth.score}/100</p>
              <p className="text-xs text-muted-foreground">Win-rate trend: {pipelineHealth.winRateTrend}</p>
              <Link href="/dashboard/crm/forecast" className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline">
                Full pipeline intelligence <ArrowRight className="size-3" />
              </Link>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card glass>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <HeartPulse className="size-4" /> Client health
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex gap-4 text-sm">
                <span className="text-emerald-600 dark:text-emerald-400">{healthDistribution.HEALTHY} Healthy</span>
                <span className="text-amber-600 dark:text-amber-400">{healthDistribution.NEEDS_ATTENTION} Needs Attention</span>
                <span className="text-destructive">{healthDistribution.HIGH_RISK} High Risk</span>
              </div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Top churn risk</p>
              {churnWatchlist.length === 0 ? (
                <p className="text-sm text-muted-foreground">No churn assessments yet.</p>
              ) : (
                churnWatchlist.map((c) => (
                  <div key={c.id} className="flex items-center justify-between text-sm">
                    <Link href={`/dashboard/clients/${c.clientId}`} className="text-foreground hover:underline">
                      {c.client.name}
                    </Link>
                    <span className="text-muted-foreground">{c.probabilityScore}% probability</span>
                  </div>
                ))
              )}
              <Link href="/dashboard/clients" className="flex items-center gap-1 text-xs text-primary hover:underline">
                All clients <ArrowRight className="size-3" />
              </Link>
            </CardContent>
          </Card>

          <Card glass>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldAlert className="size-4" /> Active risks
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {activeAlerts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No active alerts.</p>
              ) : (
                activeAlerts.map((a) => (
                  <div key={a.id} className={`rounded-md border px-3 py-2 text-sm ${SEVERITY_CLASS[a.severity]}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{a.title}</span>
                      <Badge variant="outline">{a.severity}</Badge>
                    </div>
                  </div>
                ))
              )}
              <Link href="/dashboard/alerts" className="flex items-center gap-1 text-xs text-primary hover:underline">
                All alerts <ArrowRight className="size-3" />
              </Link>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card glass>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Lightbulb className="size-4" /> Executive recommendations
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {insights.length === 0 ? (
                <p className="text-sm text-muted-foreground">No insights generated yet.</p>
              ) : (
                insights.map((i) => (
                  <div key={i.id} className="text-sm">
                    <span className="font-medium text-foreground">{i.title}</span>
                    {i.impactsCustomer && (
                      <Badge variant="outline" className="ml-2 text-[10px] text-amber-600 dark:text-amber-400">
                        Customer-impacting
                      </Badge>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card glass>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Share2 className="size-4" /> Referral attribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-foreground">{totalReferred}</p>
              <p className="text-xs text-muted-foreground">real referred leads · {totalConverted} converted</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link href="/board/strategy" className="flex items-center gap-1.5 text-sm text-primary hover:underline">
            Strategic Planning <ArrowRight className="size-3.5" />
          </Link>
          <Link href="/board/intelligence" className="flex items-center gap-1.5 text-sm text-primary hover:underline">
            Competitor & Market Intelligence <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </Container>
    </main>
  );
}
