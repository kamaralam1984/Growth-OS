import { TrendingUp, Percent, DollarSign, Gauge, Clock, Wallet } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { requireActiveMembership } from "../../_lib/require-membership";
import { formatCurrency } from "../../_lib/format";
import { MetricCard } from "../../_components/metric-card";
import { getSalesForecast } from "../_lib/forecast";

export default async function SalesForecastPage() {
  const { membership } = await requireActiveMembership("/dashboard/crm/forecast");
  const organizationId = membership.organizationId;
  const currency = membership.organization.currency;

  const [forecast, stages] = await Promise.all([
    getSalesForecast(organizationId),
    prisma.dealStage.findMany({
      where: { workspace: { organizationId } },
      orderBy: { order: "asc" },
      include: { _count: { select: { deals: true } }, deals: { select: { value: true } } },
    }),
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
      </Container>
    </main>
  );
}
