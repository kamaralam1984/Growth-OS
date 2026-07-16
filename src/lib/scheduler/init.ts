import { bullmqProvider } from "./providers/bullmq-provider";
import { JOB_DEFINITIONS } from "./registry";
import type { SchedulerProvider } from "./types";

/**
 * The active SchedulerProvider for this process. Real BullMQ + Redis as of
 * this batch (a real local Redis instance is confirmed running) — the
 * node-cron provider (providers/node-cron-provider.ts) stays in the repo as
 * a dependency-free fallback if Redis is ever unavailable in a given
 * deployment, but is not the active provider. Swapping back (or to
 * Temporal, later) is a one-line change here — nothing else in the app
 * imports a concrete provider file directly.
 */
export const scheduler: SchedulerProvider = bullmqProvider;

const globalForScheduler = globalThis as unknown as { __schedulerInitialized?: boolean };

/** Registers every job exactly once per process — guarded against Next dev's hot-reload re-executing module top-level code. Called from instrumentation.ts's register(). */
export function initScheduler(): void {
  if (globalForScheduler.__schedulerInitialized) return;
  globalForScheduler.__schedulerInitialized = true;
  for (const job of JOB_DEFINITIONS) {
    scheduler.schedule(job);
  }
  console.log(`[scheduler] initialized with ${JOB_DEFINITIONS.length} job(s).`);
}
