import { TrendingUp, Percent, DollarSign, Gauge, Clock, Wallet, Zap, FileText, Users, HeartPulse } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { requireActiveMembership } from "../../_lib/require-membership";
import { formatCurrency } from "../../_lib/format";
import { MetricCard } from "../../_components/metric-card";
import { getSalesForecast } from "../_lib/forecast";
import { getLeadVelocity, getProposalPerformance, getSalesTeamPerformance, getPipelineHealthScore } from "@/lib/pipeline/intelligence";

export default async function SalesForecastPage() {
  const { membership } = await requireActiveMembership("/dashboard/crm/forecast");
  const organizationId = membership.organizationId;
  const currency = membership.organization.currency;

  const [forecast, stages, leadVelocity, proposalPerformance, teamPerformance, pipelineHealth] = await Promise.all([
    getSalesForecast(organizationId),
    prisma.dealStage.findMany({
      where: { workspace: { organizationId } },
      orderBy: { order: "asc" },
      include: { _count: { select: { deals: true } }, deals: { select: { value: true } } },
    }),
    getLeadVelocity(organizationId),
    getProposalPerformance(organizationId),
    getSalesTeamPerformance(organizationId),
    getPipelineHealthScore(organizationId),
  ]);

  const maxStageCount = Math.max(1, ...stages.map((s) => s._count.deals));

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Sales Forecast</h1>
          <p className="text-sm text-muted-foreground">{forecast.formula}</p>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <MetricCard
            icon={Percent}
            label="Win rate"
            value={forecast.winRate != null ? `${forecast.winRate.toFixed(1)}%` : "—"}
            sublabel={forecast.winRate == null ? "No decided deals yet" : "Won ÷ (Won + Lost)"}
          />
          <MetricCard
            icon={DollarSign}
            label="Average deal size"
            value={forecast.avgDealSize != null ? formatCurrency(forecast.avgDealSize, currency) : "—"}
            sublabel="Across Won deals with a value"
          />
          <MetricCard
            icon={Clock}
            label="Avg. sales cycle"
            value={forecast.avgSalesCycleDays != null ? `${forecast.avgSalesCycleDays.toFixed(0)} days` : "—"}
            sublabel="Created → Won (approx.)"
          />
          <MetricCard
            icon={Gauge}
            label="Sales velocity"
            value={forecast.salesVelocityPerDay != null ? formatCurrency(forecast.salesVelocityPerDay, currency) : "—"}
            sublabel="Estimated $ generated per day"
          />
          <MetricCard icon={Wallet} label="Open pipeline value" value={formatCurrency(forecast.openPipelineValue, currency)} sublabel={`${forecast.openDealsCount} open deals`} />
          <MetricCard
            icon={TrendingUp}
            label="Weighted forecast"
            value={formatCurrency(forecast.weightedForecastValue, currency)}
            sublabel="Σ (value × probability)"
          />
        </div>

        <Card glass>
          <CardHeader>
            <CardTitle className="text-base">Pipeline by stage</CardTitle>
            <CardDescription>Deal count and value per stage, in pipeline order.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {stages.every((s) => s._count.deals === 0) ? (
              <p className="text-sm text-muted-foreground">No deals yet.</p>
            ) : (
              stages.map((stage) => {
                const value = stage.deals.reduce((sum, d) => sum + (d.value ?? 0), 0);
                return (
                  <div key={stage.id} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-foreground">{stage.name}</span>
                      <span className="text-muted-foreground">
                        {stage._count.deals} · {formatCurrency(value, currency)}
                      </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.max((stage._count.deals / maxStageCount) * 100, stage._count.deals > 0 ? 4 : 0)}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
        <Card glass>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <HeartPulse className="size-4" /> Pipeline health
            </CardTitle>
            <CardDescription>{pipelineHealth.formula}</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MetricCard icon={HeartPulse} label="Pipeline health score" value={`${pipelineHealth.score}/100`} sublabel="Deterministic composite" />
            <MetricCard icon={Gauge} label="Stage balance" value={`${pipelineHealth.stageBalance}/100`} sublabel="Even spread across stages" />
            <MetricCard icon={Clock} label="Stalled deals" value={`${pipelineHealth.stalledRatio}%`} sublabel="Past expected close by 14+ days" />
            <MetricCard
              icon={TrendingUp}
              label="Win-rate trend"
              value={pipelineHealth.winRateTrend === "unknown" ? "—" : pipelineHealth.winRateTrend}
              sublabel="Last 30 days vs prior 30"
            />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card glass>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Zap className="size-4" /> Lead velocity
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <MetricCard icon={Zap} label="Last 30 days" value={`${leadVelocity.last30d}`} sublabel="New leads created" />
              <MetricCard
                icon={TrendingUp}
                label="Change vs prior 30 days"
                value={leadVelocity.changePercent != null ? `${leadVelocity.changePercent.toFixed(1)}%` : "—"}
                sublabel={leadVelocity.changePercent == null ? "No leads in prior window" : `${leadVelocity.prior30d} prior`}
              />
              <MetricCard
                icon={Clock}
                label="Avg. time to Won"
                value={leadVelocity.avgTimeToWonDays != null ? `${leadVelocity.avgTimeToWonDays.toFixed(0)} days` : "—"}
                sublabel="Created → Won (approx.)"
              />
            </CardContent>
          </Card>

          <Card glass>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="size-4" /> Proposal performance
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <MetricCard icon={FileText} label="Sent" value={`${proposalPerformance.sentCount}`} sublabel="Total proposals sent" />
              <MetricCard
                icon={Percent}
                label="Open rate"
                value={proposalPerformance.openRate != null ? `${proposalPerformance.openRate.toFixed(1)}%` : "—"}
                sublabel="Opened at least once"
              />
              <MetricCard
                icon={Percent}
                label="Accept rate"
                value={proposalPerformance.acceptRate != null ? `${proposalPerformance.acceptRate.toFixed(1)}%` : "—"}
                sublabel="Accepted ÷ decided"
              />
              <MetricCard
                icon={Clock}
                label="Avg. time to accept"
                value={proposalPerformance.avgTimeToAcceptDays != null ? `${proposalPerformance.avgTimeToAcceptDays.toFixed(0)} days` : "—"}
                sublabel="Sent → Accepted"
              />
            </CardContent>
          </Card>
        </div>

        <Card glass>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="size-4" /> Sales team performance
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {teamPerformance.length === 0 ? (
              <p className="text-sm text-muted-foreground">No deals with an assigned owner yet.</p>
            ) : (
              teamPerformance.map((member) => (
                <div key={member.ownerUserId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-medium text-foreground">{member.ownerName}</span>
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <Badge variant="outline">{member.dealsWon} won</Badge>
                    <Badge variant="outline">{member.dealsLost} lost</Badge>
                    <span>{member.winRate != null ? `${member.winRate.toFixed(0)}% win rate` : "—"}</span>
                    <span>{member.avgDealSize != null ? formatCurrency(member.avgDealSize, currency) : "—"} avg</span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </Container>
    </main>
  );
}
