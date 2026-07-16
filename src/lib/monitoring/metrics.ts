import os from "node:os";
import client from "prom-client";

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/monitoring/logger";
import { getQueueStats } from "@/lib/scheduler/providers/bullmq-provider";
import { getWorkflowQueueStats } from "@/lib/workflows/engine";
import { getRagQueueStats } from "@/lib/rag/embedding-queue";
import { getRecurringBillingQueueStats } from "@/lib/billing/recurring-billing-queue";

/**
 * Real Prometheus metrics for /api/metrics — a `prom-client` Registry with:
 *  - System gauges sourced straight from Node's `os` module (never
 *    fabricated/estimated): load average, CPU count, total/free memory.
 *  - Process gauges from `process.memoryUsage()`.
 *  - Queue-depth gauges reusing each BullMQ queue's own real stats getter —
 *    the exact same getQueueStats/getWorkflowQueueStats/getRagQueueStats/
 *    getRecurringBillingQueueStats functions src/lib/monitoring/aggregate.ts
 *    already calls for /api/health — never re-derived here.
 *  - API latency/error-rate gauges from a single cheap prisma.aPIUsage
 *    aggregate over a trailing window, platform-wide (src/lib/api-usage.ts's
 *    getUsageSummary is per-organization and can't be reused as-is for a
 *    cross-tenant operator view, so this queries the same table directly).
 *
 * Every gauge here uses prom-client's `collect()` hook, so values are
 * computed fresh on every scrape rather than cached/stale between them.
 * Kept in a globalThis-cached Registry so Next dev's hot reload never
 * re-registers the same metric name twice (mirrors
 * src/lib/scheduler/init.ts's __schedulerInitialized guard).
 */

const API_USAGE_WINDOW_MS = 5 * 60 * 1000;

const globalForMetrics = globalThis as unknown as { __metricsRegistry?: client.Registry };

function registerSystemGauges(registry: client.Registry): void {
  new client.Gauge({
    name: "kvl_system_load_average",
    help: "System load average (os.loadavg()) by interval.",
    labelNames: ["interval"] as const,
    registers: [registry],
    collect(this: client.Gauge<"interval">) {
      const [load1, load5, load15] = os.loadavg();
      this.set({ interval: "1m" }, load1);
      this.set({ interval: "5m" }, load5);
      this.set({ interval: "15m" }, load15);
    },
  });

  new client.Gauge({
    name: "kvl_system_cpu_count",
    help: "Number of logical CPUs available to the process (os.cpus().length).",
    registers: [registry],
    collect(this: client.Gauge<string>) {
      this.set(os.cpus().length);
    },
  });

  new client.Gauge({
    name: "kvl_system_memory_bytes",
    help: "Total and free system memory in bytes (os.totalmem()/os.freemem()).",
    labelNames: ["state"] as const,
    registers: [registry],
    collect(this: client.Gauge<"state">) {
      this.set({ state: "total" }, os.totalmem());
      this.set({ state: "free" }, os.freemem());
    },
  });

  new client.Gauge({
    name: "kvl_process_memory_bytes",
    help: "Node process memory usage in bytes (process.memoryUsage()).",
    labelNames: ["type"] as const,
    registers: [registry],
    collect(this: client.Gauge<"type">) {
      const usage = process.memoryUsage();
      this.set({ type: "rss" }, usage.rss);
      this.set({ type: "heap_total" }, usage.heapTotal);
      this.set({ type: "heap_used" }, usage.heapUsed);
      this.set({ type: "external" }, usage.external);
      this.set({ type: "array_buffers" }, usage.arrayBuffers);
    },
  });

  new client.Gauge({
    name: "kvl_process_uptime_seconds",
    help: "Seconds since this Node process started (process.uptime()).",
    registers: [registry],
    collect(this: client.Gauge<string>) {
      this.set(process.uptime());
    },
  });
}

interface NamedQueueStats {
  active: number;
  waiting: number;
  delayed: number;
  completed: number;
  failed: number;
}

const QUEUE_GETTERS: Record<string, () => Promise<NamedQueueStats>> = {
  scheduler: getQueueStats,
  workflow: getWorkflowQueueStats,
  rag: getRagQueueStats,
  billing: getRecurringBillingQueueStats,
};

function registerQueueGauges(registry: client.Registry): void {
  new client.Gauge({
    name: "kvl_queue_jobs",
    help: "Real BullMQ job counts per queue and state (mirrors /api/health's queue components).",
    labelNames: ["queue", "state"] as const,
    registers: [registry],
    async collect(this: client.Gauge<"queue" | "state">) {
      const entries = Object.entries(QUEUE_GETTERS);
      const results = await Promise.allSettled(entries.map(([, getStats]) => getStats()));

      results.forEach((result, index) => {
        const [queue] = entries[index];
        if (result.status === "rejected") {
          logger.warn("metrics: queue stats getter failed, skipping", {
            queue,
            error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          });
          return;
        }
        const stats = result.value;
        this.set({ queue, state: "active" }, stats.active);
        this.set({ queue, state: "waiting" }, stats.waiting);
        this.set({ queue, state: "delayed" }, stats.delayed);
        this.set({ queue, state: "completed" }, stats.completed);
        this.set({ queue, state: "failed" }, stats.failed);
      });
    },
  });
}

function registerApiUsageGauges(registry: client.Registry): void {
  new client.Gauge({
    name: "kvl_api_requests_recent_total",
    help: `Total APIUsage rows recorded across all organizations in the trailing ${API_USAGE_WINDOW_MS / 60000}-minute window.`,
    registers: [registry],
    async collect(this: client.Gauge<string>) {
      try {
        const since = new Date(Date.now() - API_USAGE_WINDOW_MS);
        const count = await prisma.aPIUsage.count({ where: { createdAt: { gte: since } } });
        this.set(count);
      } catch (error) {
        logger.warn("metrics: kvl_api_requests_recent_total collect failed, skipping", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  });

  new client.Gauge({
    name: "kvl_api_error_rate",
    help: `Fraction (0-1) of APIUsage rows with statusCode >= 400 across all organizations in the trailing ${API_USAGE_WINDOW_MS / 60000}-minute window.`,
    registers: [registry],
    async collect(this: client.Gauge<string>) {
      try {
        const since = new Date(Date.now() - API_USAGE_WINDOW_MS);
        const where = { createdAt: { gte: since } };
        const [total, errors] = await Promise.all([
          prisma.aPIUsage.count({ where }),
          prisma.aPIUsage.count({ where: { ...where, statusCode: { gte: 400 } } }),
        ]);
        this.set(total > 0 ? errors / total : 0);
      } catch (error) {
        logger.warn("metrics: kvl_api_error_rate collect failed, skipping", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  });

  new client.Gauge({
    name: "kvl_api_avg_response_time_ms",
    help: `Average APIUsage.responseTimeMs across all organizations in the trailing ${API_USAGE_WINDOW_MS / 60000}-minute window.`,
    registers: [registry],
    async collect(this: client.Gauge<string>) {
      try {
        const since = new Date(Date.now() - API_USAGE_WINDOW_MS);
        const aggregate = await prisma.aPIUsage.aggregate({
          where: { createdAt: { gte: since } },
          _avg: { responseTimeMs: true },
        });
        this.set(aggregate._avg.responseTimeMs ?? 0);
      } catch (error) {
        logger.warn("metrics: kvl_api_avg_response_time_ms collect failed, skipping", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
  });
}

/** Builds (once per process) and returns the shared Prometheus Registry for /api/metrics. */
export function getMetricsRegistry(): client.Registry {
  if (globalForMetrics.__metricsRegistry) return globalForMetrics.__metricsRegistry;

  const registry = new client.Registry();
  registerSystemGauges(registry);
  registerQueueGauges(registry);
  registerApiUsageGauges(registry);

  globalForMetrics.__metricsRegistry = registry;
  return registry;
}
