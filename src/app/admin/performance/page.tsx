import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { requirePlatformOwner } from "@/lib/billing/platform-admin";
import { listLatestLoadTestResults, listRecentLoadTestResults, suggestOptimizations } from "@/lib/ops/load-test";
import type { LoadTestResult, LoadTestScenario } from "@/generated/prisma/client";

const SCENARIO_ORDER: LoadTestScenario[] = ["SMOKE_10", "RAMP_100", "RAMP_500", "RAMP_1000", "RAMP_10000"];

const SCENARIO_LABEL: Record<LoadTestScenario, string> = {
  SMOKE_10: "10 users (smoke)",
  RAMP_100: "100 users",
  RAMP_500: "500 users",
  RAMP_1000: "1,000 users",
  RAMP_10000: "10,000 users",
};

function formatDateTime(date: Date): string {
  return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * Real load-test results only — every row here comes from an actually-
 * executed run (scripts/load-test.js via k6, or scripts/run-load-test-
 * local.ts's dependency-free harness), never a fabricated number. A
 * scenario with no row honestly renders "not yet run at this scale" — this
 * codebase has no way to responsibly simulate a real 10,000-concurrent-user
 * environment from a single dev box, so RAMP_1000/RAMP_10000 are expected
 * to stay empty until run against real staging/production infrastructure
 * with real multi-region load-generation capacity.
 */
function realBottlenecks(result: LoadTestResult): string[] {
  const bottlenecks = (result.bottlenecks as string[] | null) ?? [];
  // Pre-existing rows recorded before analyzeBottlenecks() existed may carry
  // the old harness's "No threshold breaches..." placeholder string — never
  // a real bottleneck, so it's filtered out here rather than backfilled.
  return bottlenecks.filter((b) => !b.startsWith("No threshold"));
}

export default async function AdminPerformancePage() {
  await requirePlatformOwner("/admin/performance");

  const [latestByScenario, recent] = await Promise.all([listLatestLoadTestResults(), listRecentLoadTestResults(30)]);
  const flaggedRuns = recent
    .map((r) => ({ result: r, bottlenecks: realBottlenecks(r) }))
    .filter((entry) => entry.bottlenecks.length > 0);

  return (
    <Container className="flex flex-col gap-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Load Testing &amp; Performance</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Real, actually-executed load-test results — p50/p95/p99 latency and error rate come straight from real HTTP
          responses, never estimated. Run <code className="text-xs">npm run test:load</code> (k6, needs the k6 binary) or{" "}
          <code className="text-xs">npm run test:load:local -- &lt;concurrency&gt; &lt;seconds&gt;</code> (dependency-free) against
          a real running server to add a result.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {SCENARIO_ORDER.map((scenario) => {
          const result = latestByScenario[scenario];
          return (
            <Card key={scenario}>
              <CardHeader className="pb-2">
                <CardDescription>{SCENARIO_LABEL[scenario]}</CardDescription>
                <CardTitle className="text-xl">{result ? `${result.p95Ms}ms p95` : "—"}</CardTitle>
              </CardHeader>
              <CardContent>
                {result ? (
                  <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                    <span>{result.requestsPerSecond.toFixed(1)} req/s · {(result.errorRate * 100).toFixed(2)}% errors</span>
                    <span>{formatDateTime(result.runAt)}</span>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Not yet run at this scale.</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card glass>
        <CardHeader>
          <CardTitle>Recent runs</CardTitle>
          <CardDescription>{recent.length} total</CardDescription>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No load tests recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scenario</TableHead>
                  <TableHead>Concurrency</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>p50</TableHead>
                  <TableHead>p95</TableHead>
                  <TableHead>p99</TableHead>
                  <TableHead>Errors</TableHead>
                  <TableHead>req/s</TableHead>
                  <TableHead>Bottlenecks</TableHead>
                  <TableHead>Run at</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((r) => {
                  const bottlenecks = realBottlenecks(r);
                  const hasRealBottleneck = bottlenecks.length > 0;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{SCENARIO_LABEL[r.scenario]}</TableCell>
                      <TableCell className="text-muted-foreground">{r.targetConcurrency}</TableCell>
                      <TableCell className="text-muted-foreground">{r.requestsCompleted}</TableCell>
                      <TableCell className="text-muted-foreground">{r.p50Ms}ms</TableCell>
                      <TableCell className="text-muted-foreground">{r.p95Ms}ms</TableCell>
                      <TableCell className="text-muted-foreground">{r.p99Ms}ms</TableCell>
                      <TableCell className="text-muted-foreground">{(r.errorRate * 100).toFixed(2)}%</TableCell>
                      <TableCell className="text-muted-foreground">{r.requestsPerSecond.toFixed(1)}</TableCell>
                      <TableCell className="max-w-xs">
                        {hasRealBottleneck ? (
                          <Badge variant="secondary" className="text-xs">
                            {bottlenecks.length} flagged
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">
                            None
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(r.runAt)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card glass>
        <CardHeader>
          <CardTitle>Bottleneck detail &amp; suggested next steps</CardTitle>
          <CardDescription>
            {flaggedRuns.length === 0
              ? "No run in the last 30 has crossed a bottleneck threshold."
              : `${flaggedRuns.length} of ${recent.length} recent runs crossed a threshold — see src/lib/ops/load-test.ts's analyzeBottlenecks for the exact rule that fired.`}
          </CardDescription>
        </CardHeader>
        {flaggedRuns.length > 0 && (
          <CardContent className="flex flex-col gap-5">
            {flaggedRuns.map(({ result, bottlenecks }) => {
              const suggestions = suggestOptimizations(bottlenecks);
              return (
                <div key={result.id} className="rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{SCENARIO_LABEL[result.scenario]}</span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(result.runAt)}</span>
                    <Badge variant="secondary" className="ml-auto text-xs">
                      {bottlenecks.length} bottleneck{bottlenecks.length === 1 ? "" : "s"}
                    </Badge>
                  </div>

                  <ul className="mt-3 flex flex-col gap-1.5">
                    {bottlenecks.map((b) => (
                      <li key={b} className="flex gap-2 text-xs text-muted-foreground">
                        <Badge variant="accent" className="h-fit shrink-0 text-[10px]">
                          bottleneck
                        </Badge>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>

                  {suggestions.length > 0 && (
                    <ul className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3">
                      {suggestions.map((s) => (
                        <li key={s} className="flex gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline" className="h-fit shrink-0 text-[10px]">
                            suggestion
                          </Badge>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </CardContent>
        )}
      </Card>
    </Container>
  );
}
