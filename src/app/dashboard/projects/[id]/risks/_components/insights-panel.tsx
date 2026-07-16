import { TrendingUp, DollarSign, Users, Gauge, Star } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { ProjectInsights } from "@/lib/projects/insights";

function money(value: number, currency?: string | null): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD", maximumFractionDigits: 0 }).format(value);
}

export function InsightsPanel({ insights }: { insights: ProjectInsights }) {
  const { completion, budgetRisk, resourceShortage, productivity, clientSatisfaction } = insights;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Card>
        <CardContent className="flex flex-col gap-1.5 p-5">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <TrendingUp className="size-3.5" /> Completion prediction
          </p>
          {completion.estimatedCompletionDate ? (
            <p className="text-lg font-semibold text-foreground">{completion.estimatedCompletionDate.toLocaleDateString()}</p>
          ) : (
            <p className="text-lg font-semibold text-muted-foreground">Not enough data</p>
          )}
          <p className="text-xs text-muted-foreground">{completion.basis}</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-1.5 p-5">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <DollarSign className="size-3.5" /> Budget risk
          </p>
          <p className="text-lg font-semibold text-foreground">
            {money(budgetRisk.spent)}
            {budgetRisk.budget != null && <span className="text-sm font-normal text-muted-foreground"> / {money(budgetRisk.budget)}</span>}
          </p>
          <p className="text-xs text-muted-foreground">
            {budgetRisk.ratio != null ? `${Math.round(budgetRisk.ratio * 100)}% of budget spent` : "No budget set"}
            {budgetRisk.trend ? ` · Spend trend: ${budgetRisk.trend}` : ""}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-1.5 p-5">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <Users className="size-3.5" /> Resource capacity
          </p>
          {resourceShortage ? (
            <>
              <p className="text-lg font-semibold text-foreground">
                {Math.round(resourceShortage.assignedOpenHours)}h / {Math.round(resourceShortage.totalCapacityHoursPerWeek)}h weekly
              </p>
              <p className="text-xs text-muted-foreground">
                {resourceShortage.shortfallHours > 0 ? `Shortfall of ${Math.round(resourceShortage.shortfallHours)}h against real team capacity` : "Within team capacity"}
              </p>
            </>
          ) : (
            <p className="text-lg font-semibold text-muted-foreground">No capacity data set</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-1.5 p-5">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <Star className="size-3.5" /> Client satisfaction
          </p>
          {clientSatisfaction ? (
            <>
              <p className="text-lg font-semibold text-foreground">{clientSatisfaction.average.toFixed(1)} / 5</p>
              <p className="text-xs text-muted-foreground">From {clientSatisfaction.count} milestone approval rating(s)</p>
            </>
          ) : (
            <p className="text-lg font-semibold text-muted-foreground">Not enough data</p>
          )}
        </CardContent>
      </Card>

      <Card className="sm:col-span-2">
        <CardContent className="flex flex-col gap-3 p-5">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <Gauge className="size-3.5" /> Productivity by team member
          </p>
          {productivity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No project members yet.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {productivity.map((m) => (
                <div key={m.userId} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-sm text-foreground">{m.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {m.completedTasks} completed · {m.ratio != null ? `${(m.ratio * 100).toFixed(0)}% of estimate` : "Not enough data"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
