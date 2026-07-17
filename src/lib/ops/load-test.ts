import { prisma } from "@/lib/prisma";
import type { LoadTestResult, LoadTestScenario } from "@/generated/prisma/client";

/**
 * Real load-test result persistence — a row is only ever written after a
 * real test run genuinely completed against a real target (either the
 * k6 script, scripts/load-test.js, parsed from its JSON summary, or the
 * lighter in-repo harness, scripts/run-load-test-local.ts). Never
 * fabricates a scenario that wasn't actually run — the dashboard must
 * render an honest "not yet run at this scale" for any LoadTestScenario
 * with no row, rather than implying failure or success.
 */

export interface RecordLoadTestInput {
  scenario: LoadTestScenario;
  targetConcurrency: number;
  requestsCompleted: number;
  durationMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  errorRate: number;
  requestsPerSecond: number;
  rawOutputPath?: string;
  runByUserId?: string;
}

/**
 * The subset of a run's real metrics that bottleneck analysis needs —
 * deliberately narrower than RecordLoadTestInput (no scenario/rawOutputPath/
 * runByUserId) so analyzeBottlenecks can be unit-tested and called from
 * anywhere with just the numbers, without needing a full input object.
 */
export type LoadTestMetrics = Pick<
  RecordLoadTestInput,
  "targetConcurrency" | "requestsCompleted" | "durationMs" | "p50Ms" | "p95Ms" | "p99Ms" | "errorRate" | "requestsPerSecond"
>;

// Mirrors scripts/load-test.js's own k6 `http_req_duration: ["p(95)<800"]`
// threshold — that script already treats a run as "failing" past this
// point, so bottleneck analysis flags the same number instead of inventing
// a second, disagreeing one.
const P95_MS_THRESHOLD = 800;

// p99 gets roughly double the p95 budget to allow for normal tail variance
// (a handful of slower requests is expected even in a healthy run). Past
// this, a meaningful minority of requests are hitting a materially slower
// path than the rest (cold cache entry, connection-pool queueing, GC
// pause) rather than latency being uniformly elevated — a different failure
// mode than a high p95, worth flagging separately.
const P99_MS_THRESHOLD = P95_MS_THRESHOLD * 2;

// Mirrors scripts/load-test.js's own k6 `http_req_failed`/`errors` threshold
// (rate<0.01), for the same reason as P95_MS_THRESHOLD above.
const ERROR_RATE_THRESHOLD = 0.01;

// If N concurrent workers were truly running in parallel, throughput should
// scale toward targetConcurrency / (p50Ms / 1000) req/s. Below half of that
// theoretical ceiling, requests are serializing on a shared resource
// (DB connection pool, a single Redis connection, event-loop contention)
// instead of actually running concurrently — 0.5 is a deliberately generous
// margin so this only fires on a real, large scaling shortfall, not normal
// queueing noise.
const THROUGHPUT_SCALING_RATIO = 0.5;

/**
 * Deterministic, rule-based bottleneck analysis — no AI/LLM involved, and
 * no randomness. Every threshold above is anchored to a real, pre-existing
 * number elsewhere in this codebase (scripts/load-test.js's own k6 pass/
 * fail thresholds) or a real formula derived from the run's own numbers
 * (the throughput-scaling check), never picked arbitrarily, so a flagged
 * bottleneck is always traceable to something a human can go verify.
 * Called from recordLoadTestResult below, never left to a caller to
 * self-report — so `bottlenecks` on a LoadTestResult row is always computed
 * from that same row's real metrics, not something a script can fabricate.
 */
export function analyzeBottlenecks(metrics: LoadTestMetrics): string[] {
  const bottlenecks: string[] = [];

  if (metrics.p95Ms > P95_MS_THRESHOLD) {
    bottlenecks.push(
      `p95 latency (${metrics.p95Ms}ms) exceeds the ${P95_MS_THRESHOLD}ms threshold enforced by scripts/load-test.js's own k6 http_req_duration check.`,
    );
  }

  if (metrics.p99Ms > P99_MS_THRESHOLD) {
    bottlenecks.push(
      `p99 latency (${metrics.p99Ms}ms) exceeds ${P99_MS_THRESHOLD}ms (2x the p95 budget) — a subset of requests are hitting a materially slower path than the rest, not just uniformly elevated latency.`,
    );
  }

  if (metrics.errorRate > ERROR_RATE_THRESHOLD) {
    bottlenecks.push(
      `Error rate (${(metrics.errorRate * 100).toFixed(2)}%) exceeds the ${(ERROR_RATE_THRESHOLD * 100).toFixed(0)}% threshold enforced by scripts/load-test.js's own k6 http_req_failed/errors check.`,
    );
  }

  if (metrics.targetConcurrency > 1 && metrics.p50Ms > 0) {
    const theoreticalMaxRps = metrics.targetConcurrency / (metrics.p50Ms / 1000);
    if (metrics.requestsPerSecond < theoreticalMaxRps * THROUGHPUT_SCALING_RATIO) {
      bottlenecks.push(
        `Throughput (${metrics.requestsPerSecond.toFixed(1)} req/s) is under ${(THROUGHPUT_SCALING_RATIO * 100).toFixed(0)}% of the ~${theoreticalMaxRps.toFixed(1)} req/s that ${metrics.targetConcurrency} concurrent workers at the observed p50 latency (${metrics.p50Ms}ms) should sustain if truly running in parallel — requests are likely serializing on a shared resource instead of scaling with concurrency.`,
      );
    }
  }

  return bottlenecks;
}

interface BottleneckRule {
  /** Matches the start of an analyzeBottlenecks() message for this category — see the fixed message prefixes above. */
  prefix: string;
  suggestion: string;
}

// One rule per analyzeBottlenecks() category above, each suggestion naming
// the actual file(s)/mechanism in this codebase most likely responsible —
// never generic advice like "consider caching" with no specifics.
const BOTTLENECK_RULES: BottleneckRule[] = [
  {
    prefix: "p95 latency (",
    suggestion:
      "Check per-route latency, not just the aggregate: /api/health (src/app/api/health/route.ts) runs a full live probe — DB, Redis, every BullMQ queue, via runAndRecordFullSystemCheck — on EVERY request with no caching, making it a likely dominant contributor to p95 under load; consider wrapping its result in withCache (src/lib/cache/redis-cache.ts) with a short TTL, since a few seconds of staleness is an acceptable tradeoff for a public health endpoint. For other routes, check @@index coverage in prisma/schema.prisma for whatever query the slow route runs.",
  },
  {
    prefix: "p99 latency (",
    suggestion:
      "A tail-latency blowout (p99 much worse than p95) is usually queueing or a cold path, not uniformly slow code: check whether requests are queueing for a DB connection — src/lib/prisma.ts's PrismaPg adapter sets no explicit `max`, so it inherits node-postgres's default pool cap of 10 — or a Redis round trip (src/lib/redis-client.ts) rather than Node GC. The fix differs (raise the pool size vs. reduce Redis calls on the hot path), so isolate which requests are slow before picking one.",
  },
  {
    prefix: "Error rate (",
    suggestion:
      "A rising error rate under concurrency usually signals a capacity limit, not a correctness bug: check whether the in-memory rate limiter (src/lib/rate-limit.ts, ~31 call sites) or the Redis-backed one (src/lib/security/rate-limit-distributed.ts, used by src/proxy.ts and src/auth.ts) has a limit tighter than this scenario's targetConcurrency, and check the PrismaPg adapter's pool size (src/lib/prisma.ts — no explicit `max`, so it defaults to node-postgres's 10) against Postgres's own max_connections — pool exhaustion surfaces as request-level errors, not just added latency.",
  },
  {
    prefix: "Throughput (",
    suggestion:
      "Throughput not scaling with concurrency points at serialization on a shared resource: consider raising the PrismaPg adapter's pool `max` in src/lib/prisma.ts (currently unset, so it's node-postgres's default of 10) if Postgres's max_connections has headroom, and check whether this route's read-heavy queries actually go through prismaRead (src/lib/prisma.ts's read-replica-aware client) instead of contending with writes on the primary pool.",
  },
];

/**
 * Maps real, already-flagged bottleneck labels to concrete, actionable
 * suggestions grounded in this app's real infrastructure. Deterministic
 * prefix matching against analyzeBottlenecks()'s own fixed message
 * prefixes — not an LLM guess, and never fabricates a suggestion for a
 * bottleneck category that wasn't actually flagged.
 */
export function suggestOptimizations(bottlenecks: string[]): string[] {
  const suggestions: string[] = [];
  for (const rule of BOTTLENECK_RULES) {
    if (bottlenecks.some((b) => b.startsWith(rule.prefix))) {
      suggestions.push(rule.suggestion);
    }
  }
  return suggestions;
}

export async function recordLoadTestResult(input: RecordLoadTestInput): Promise<LoadTestResult> {
  const bottlenecks = analyzeBottlenecks(input);
  return prisma.loadTestResult.create({
    data: {
      scenario: input.scenario,
      targetConcurrency: input.targetConcurrency,
      requestsCompleted: input.requestsCompleted,
      durationMs: input.durationMs,
      p50Ms: input.p50Ms,
      p95Ms: input.p95Ms,
      p99Ms: input.p99Ms,
      errorRate: input.errorRate,
      requestsPerSecond: input.requestsPerSecond,
      bottlenecks: bottlenecks.length > 0 ? bottlenecks : undefined,
      rawOutputPath: input.rawOutputPath,
      runByUserId: input.runByUserId,
    },
  });
}

/** Latest result per scenario — for the Performance dashboard's "current state" view. */
export async function listLatestLoadTestResults(): Promise<Record<LoadTestScenario, LoadTestResult | null>> {
  const scenarios: LoadTestScenario[] = ["SMOKE_10", "RAMP_100", "RAMP_500", "RAMP_1000", "RAMP_10000"];
  const results = await Promise.all(
    scenarios.map((scenario) => prisma.loadTestResult.findFirst({ where: { scenario }, orderBy: { runAt: "desc" } })),
  );
  return Object.fromEntries(scenarios.map((s, i) => [s, results[i]])) as Record<LoadTestScenario, LoadTestResult | null>;
}

export async function listRecentLoadTestResults(limit = 30): Promise<LoadTestResult[]> {
  return prisma.loadTestResult.findMany({ orderBy: { runAt: "desc" }, take: limit });
}
