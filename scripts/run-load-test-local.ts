/**
 * A real, dependency-free local load-test harness — a lighter complement to
 * scripts/load-test.js (which needs the separate k6 binary; see that file's
 * top comment). Uses Node's built-in fetch to run a genuine N-concurrent-
 * worker pool against a real running server for a fixed duration, computes
 * real p50/p95/p99 latency and error rate from the actual responses (never
 * synthetic numbers), and persists one real LoadTestResult row via
 * src/lib/ops/load-test.ts — which also computes that row's `bottlenecks`
 * itself (see analyzeBottlenecks in load-test.ts), so this script doesn't
 * duplicate that logic. Use this when k6 isn't installed; prefer
 * scripts/load-test.js (k6) for anything CI-grade or high-concurrency.
 *
 * Usage:
 *   tsx scripts/run-load-test-local.ts <concurrency> <durationSeconds> [baseUrl]
 *   tsx scripts/run-load-test-local.ts 10 20
 *   tsx scripts/run-load-test-local.ts 100 30 http://localhost:4100
 */
import { recordLoadTestResult } from "@/lib/ops/load-test";
import type { LoadTestScenario } from "@/generated/prisma/client";

const concurrency = Number(process.argv[2] ?? 10);
const durationSeconds = Number(process.argv[3] ?? 20);
const baseUrl = process.argv[4] ?? process.env.BASE_URL ?? "http://localhost:3000";

const ENDPOINTS = ["/", "/api/health", "/login"];

function scenarioForConcurrency(n: number): LoadTestScenario {
  if (n <= 10) return "SMOKE_10";
  if (n <= 100) return "RAMP_100";
  if (n <= 500) return "RAMP_500";
  if (n <= 1000) return "RAMP_1000";
  return "RAMP_10000";
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

async function worker(deadline: number, latencies: number[], errors: { count: number }): Promise<number> {
  let completed = 0;
  while (Date.now() < deadline) {
    const path = ENDPOINTS[completed % ENDPOINTS.length];
    const start = Date.now();
    try {
      const res = await fetch(`${baseUrl}${path}`, { redirect: "manual" });
      const elapsed = Date.now() - start;
      latencies.push(elapsed);
      // redirect (3xx, e.g. an auth gate) counts as a real, successful response — only 5xx/network failure is an error.
      if (res.status >= 500) errors.count += 1;
    } catch {
      latencies.push(Date.now() - start);
      errors.count += 1;
    }
    completed += 1;
  }
  return completed;
}

async function main(): Promise<void> {
  const scenario = scenarioForConcurrency(concurrency);
  console.log(`[load-test-local] scenario=${scenario} concurrency=${concurrency} duration=${durationSeconds}s target=${baseUrl}`);

  const latencies: number[] = [];
  const errors = { count: 0 };
  const start = Date.now();
  const deadline = start + durationSeconds * 1000;

  const workers = Array.from({ length: concurrency }, () => worker(deadline, latencies, errors));
  const completedCounts = await Promise.all(workers);
  const totalDurationMs = Date.now() - start;
  const requestsCompleted = completedCounts.reduce((sum, c) => sum + c, 0);

  const sorted = [...latencies].sort((a, b) => a - b);
  const p50Ms = percentile(sorted, 50);
  const p95Ms = percentile(sorted, 95);
  const p99Ms = percentile(sorted, 99);
  const errorRate = requestsCompleted > 0 ? errors.count / requestsCompleted : 0;
  const requestsPerSecond = requestsCompleted / (totalDurationMs / 1000);

  console.log(`[load-test-local] completed=${requestsCompleted} p50=${p50Ms}ms p95=${p95Ms}ms p99=${p99Ms}ms errorRate=${(errorRate * 100).toFixed(2)}% rps=${requestsPerSecond.toFixed(1)}`);

  const result = await recordLoadTestResult({
    scenario,
    targetConcurrency: concurrency,
    requestsCompleted,
    durationMs: totalDurationMs,
    p50Ms,
    p95Ms,
    p99Ms,
    errorRate,
    requestsPerSecond,
  });
  console.log(`[load-test-local] recorded LoadTestResult ${result.id} — bottlenecks: ${(result.bottlenecks as string[] | null)?.length ?? 0}`);
}

main()
  .catch((error) => {
    console.error("[load-test-local] unexpected error:", error);
    process.exit(1);
  })
  .finally(() => process.exit(0));
