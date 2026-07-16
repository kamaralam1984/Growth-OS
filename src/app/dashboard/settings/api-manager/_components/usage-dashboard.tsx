import { Activity, AlertTriangle, KeyRound, Timer } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { getUsageByApiKey, getUsageSummary, getUsageTimeSeries } from "@/lib/api-usage";
import { CallsOverTimeChart } from "./calls-over-time-chart";

const ELEVATED_ERROR_RATE_PCT = 5;

export async function UsageDashboard({
  organizationId,
  days = 30,
}: {
  organizationId: string;
  days?: number;
}) {
  const [summary, timeSeries, byApiKey] = await Promise.all([
    getUsageSummary(organizationId, days),
    getUsageTimeSeries(organizationId, days),
    getUsageByApiKey(organizationId, days),
  ]);

  if (summary.totalCalls === 0) {
    return (
      <Card glass>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="size-4" /> API usage
          </CardTitle>
          <CardDescription>Real request-level metrics for keys and integrations on this organization.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="py-8 text-center text-sm text-muted-foreground">
            No API usage recorded yet — once a request authenticates with an API key or an integration connection, it
            will show up here.
          </p>
        </CardContent>
      </Card>
    );
  }

  const errorRatePct = summary.errorRate * 100;
  const isElevated = errorRatePct >= ELEVATED_ERROR_RATE_PCT;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">API usage</h2>
        <p className="text-sm text-muted-foreground">Real request-level metrics, last {days} days.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Activity className="size-3.5" /> Total calls ({days}d)
            </CardDescription>
            <CardTitle className="text-3xl">{summary.totalCalls.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <AlertTriangle className="size-3.5" /> Error rate
            </CardDescription>
            <CardTitle className={cn("text-3xl", isElevated ? "text-red-500" : "text-foreground")}>
              {errorRatePct.toFixed(1)}%
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Timer className="size-3.5" /> Avg response time
            </CardDescription>
            <CardTitle className="text-3xl">{Math.round(summary.avgResponseTimeMs)}ms</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card glass>
        <CardHeader>
          <CardTitle className="text-base">Calls over time</CardTitle>
          <CardDescription>Daily call volume, last {days} days.</CardDescription>
        </CardHeader>
        <CardContent>
          <CallsOverTimeChart
            points={timeSeries.map((p) => ({
              label: new Date(p.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
              value: p.count,
            }))}
            formatValue={(v) => `${Math.round(v)} calls`}
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card glass>
          <CardHeader>
            <CardTitle className="text-base">Top endpoints</CardTitle>
            <CardDescription>By call volume, last {days} days.</CardDescription>
          </CardHeader>
          <CardContent>
            {summary.byEndpoint.length === 0 ? (
              <p className="text-sm text-muted-foreground">No endpoint data yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Endpoint</TableHead>
                    <TableHead className="text-right">Calls</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.byEndpoint.map((endpoint) => (
                    <TableRow key={endpoint.endpoint}>
                      <TableCell className="font-mono text-xs text-foreground">{endpoint.endpoint}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{endpoint.count.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card glass>
          <CardHeader>
            <CardTitle className="text-base">Per-key usage</CardTitle>
            <CardDescription>Calls, errors, and average latency by API key, last {days} days.</CardDescription>
          </CardHeader>
          <CardContent>
            {byApiKey.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No calls attributed to an API key yet — integration-connection traffic isn&apos;t broken out here.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Key</TableHead>
                    <TableHead className="text-right">Calls</TableHead>
                    <TableHead className="text-right">Errors</TableHead>
                    <TableHead className="text-right">Avg ms</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byApiKey.map((key) => (
                    <TableRow key={key.apiKeyId}>
                      <TableCell className="font-medium text-foreground">
                        <span className="flex items-center gap-1.5">
                          <KeyRound className="size-3.5 shrink-0 text-muted-foreground" />
                          {key.keyName}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{key.count.toLocaleString()}</TableCell>
                      <TableCell className={cn("text-right", key.errorCount > 0 ? "text-red-500" : "text-muted-foreground")}>
                        {key.errorCount.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{Math.round(key.avgResponseTimeMs)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
