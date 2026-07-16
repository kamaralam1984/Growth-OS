/**
 * Scheduler Service — provider-agnostic background job engine.
 *
 * Business logic (src/lib/scheduler/registry.ts and every job handler it
 * registers) never imports node-cron, BullMQ, or any other job runner
 * directly — handlers are plain async functions registered against the
 * SchedulerProvider interface below. The only concrete implementation today
 * is providers/node-cron-provider.ts, an in-process cron runner suitable for
 * this app's current single-Node-process deployment (no Redis/Docker/queue
 * infra exists yet). Migrating to BullMQ+Redis, Temporal, or a cloud
 * scheduler later means writing a new class that implements
 * SchedulerProvider and swapping it in src/lib/scheduler/init.ts — registry.ts
 * and every job handler stay untouched.
 */

export interface RetryPolicy {
  maxAttempts: number;
  backoffMs: number;
}

export interface JobRunLog {
  level: "info" | "warn" | "error";
  message: string;
  organizationId?: string;
}

export interface JobDefinition {
  /** Stable handler key, e.g. "daily-executive-board-meeting". Never renamed once shipped — it's the DB identity. */
  key: string;
  name: string;
  /** Standard 5 or 6-field cron expression (node-cron syntax). */
  cronExpression: string;
  /**
   * IANA timezone string (e.g. "America/New_York") the cron pattern is
   * evaluated in. Unset means BullMQ's own default — confirmed from
   * cron-parser's real source (node_modules/cron-parser/lib/date.js): with
   * no `tz`, it builds dates via luxon with `zone: undefined`, which
   * resolves to the server process's local system timezone, NOT UTC.
   */
  timezone?: string;
  /** Real business logic. Return an array of JobRunLog entries to surface in the Job Management Dashboard's log viewer — never fabricate a success log if the handler didn't actually do the described work. */
  handler: () => Promise<JobRunLog[] | void>;
  retryPolicy?: RetryPolicy;
  timeoutMs?: number;
  /**
   * BullMQ job priority, 1 (highest) to 5 (lowest) — a practical range for
   * this app's job set, well within BullMQ's real 1–2,097,151 scale. 1-2:
   * critical/user-facing (e.g. overdue detection, alerts). 3: time-sensitive
   * reminders. 4-5: background/bulk housekeeping. Unset means BullMQ's own
   * default (no explicit priority — processed ahead of any prioritized job,
   * i.e. same as priority 0), so leave it unset only for jobs where relative
   * ordering genuinely doesn't matter.
   */
  priority?: number;
}

export interface JobStatus {
  key: string;
  name: string;
  cronExpression: string;
  enabled: boolean;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  /** See JobDefinition.priority. Persisted on the ScheduledJob row so the Job Management Dashboard can render it without importing registry.ts. */
  priority: number | null;
}

export interface JobRunRecord {
  id: string;
  status: "RUNNING" | "SUCCESS" | "FAILED" | "RETRYING";
  startedAt: Date;
  finishedAt: Date | null;
  attempt: number;
  error: string | null;
  logs: JobRunLog[] | null;
}

export interface SchedulerProvider {
  /** Registers a job and starts its cron schedule. Idempotent — safe to call once at process bootstrap. */
  schedule(job: JobDefinition): void;
  /** Runs a registered job immediately, outside its cron schedule (Job Management Dashboard "Run now"). */
  trigger(key: string): Promise<void>;
  pause(key: string): Promise<void>;
  resume(key: string): Promise<void>;
  disable(key: string): Promise<void>;
  getStatus(key: string): Promise<JobStatus | null>;
  listStatuses(): Promise<JobStatus[]>;
  listRuns(key: string, limit?: number): Promise<JobRunRecord[]>;
}
