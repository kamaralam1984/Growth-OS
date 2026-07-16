import { Gauge } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { checkPlanLimit, getCurrentPeriodUsage } from "@/lib/billing/usage-metering";
import type { UsageMetricType } from "@/generated/prisma/client";
import { requireActiveMembership } from "../../_lib/require-membership";
import { getDailyUsageTotals } from "./_lib/usage-queries";
import { UsageStatTile } from "./_components/usage-stat-tile";
import { UsageOverTimeChart } from "./_components/usage-over-time-chart";

const CHART_DAYS = 30;

// Every metric with a real Plan-limit mapping in checkPlanLimit's
// PLAN_LIMIT_FIELD table — rendered with a limit bar. BANDWIDTH_MB has no
// mapping today (checkPlanLimit always returns allowed:true/limit:null for
// it), so it's rendered separately as a plain usage number below.
const LIMITED_METRICS: UsageMetricType[] = [
  "USERS",
  "WORKSPACES",
  "AI_TOKENS",
  "STORAGE_MB",
  "PROJECTS",
  "CRM_RECORDS",
  "AUTOMATION_RUNS",
  "KNOWLEDGE_BASE_MB",
  "API_CALLS",
];

const METRIC_LABELS: Record<UsageMetricType, string> = {
  USERS: "Users",
  WORKSPACES: "Workspaces",
  AI_TOKENS: "AI Tokens",
  STORAGE_MB: "Storage",
  PROJECTS: "Projects",
  CRM_RECORDS: "CRM Records",
  AUTOMATION_RUNS: "Automation Runs",
  KNOWLEDGE_BASE_MB: "Knowledge Base",
  API_CALLS: "API Calls",
  BANDWIDTH_MB: "Bandwidth",
};

const METRIC_UNITS: Partial<Record<UsageMetricType, string>> = {
  STORAGE_MB: "MB",
  KNOWLEDGE_BASE_MB: "MB",
  BANDWIDTH_MB: "MB",
};

export default async function UsageDashboardPage() {
  const { membership } = await requireActiveMembership("/dashboard/billing/usage");
  const organizationId = membership.organizationId;

  const [limitChecks, bandwidthUsage, aiTokensDaily, automationRunsDaily] = await Promise.all([
    Promise.all(LIMITED_METRICS.map(async (metricType) => ({ metricType, check: await checkPlanLimit(organizationId, metricType) }))),
    getCurrentPeriodUsage(organizationId, "BANDWIDTH_MB"),
    getDailyUsageTotals(organizationId, "AI_TOKENS", CHART_DAYS),
    getDailyUsageTotals(organizationId, "AUTOMATION_RUNS", CHART_DAYS),
  ]);

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
            <Gauge className="size-5" /> Usage
          </h1>
          <p className="text-sm text-muted-foreground">
            Real, live usage against your organization&rsquo;s current plan limits — every number below is a real
            Prisma query result, not an estimate.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {limitChecks.map(({ metricType, check }) => (
            <UsageStatTile
              key={metricType}
              label={METRIC_LABELS[metricType]}
              current={check.current}
              limit={check.limit}
              unit={METRIC_UNITS[metricType]}
            />
          ))}
          <UsageStatTile label={METRIC_LABELS.BANDWIDTH_MB} current={bandwidthUsage} limit={null} unit="MB" />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card glass>
            <CardHeader>
              <CardTitle className="text-base">AI Tokens over time</CardTitle>
              <CardDescription>Daily AI-token usage recorded via recordUsage, last {CHART_DAYS} days.</CardDescription>
            </CardHeader>
            <CardContent>
              <UsageOverTimeChart
                points={aiTokensDaily.map((p) => ({
                  label: new Date(p.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
                  value: p.total,
                }))}
                formatValue={(v) => `${Math.round(v).toLocaleString()} tokens`}
              />
            </CardContent>
          </Card>

          <Card glass>
            <CardHeader>
              <CardTitle className="text-base">Automation Runs over time</CardTitle>
              <CardDescription>Daily automation-run volume, last {CHART_DAYS} days.</CardDescription>
            </CardHeader>
            <CardContent>
              <UsageOverTimeChart
                points={automationRunsDaily.map((p) => ({
                  label: new Date(p.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
                  value: p.total,
                }))}
                formatValue={(v) => `${Math.round(v).toLocaleString()} run${Math.round(v) === 1 ? "" : "s"}`}
              />
            </CardContent>
          </Card>
        </div>
      </Container>
    </main>
  );
}
