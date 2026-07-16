import { Play, Pause, RotateCcw, Clock, RefreshCw, Trash2, Globe } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireActiveMembership } from "../../_lib/require-membership";
import { scheduler } from "@/lib/scheduler/init";
import { getQueueStats, listFailedJobs } from "@/lib/scheduler/providers/bullmq-provider";
import { JOB_DEFINITIONS } from "@/lib/scheduler/registry";
import { runJobNow, pauseJob, resumeJob, retryFailedJobAction, discardFailedJobAction } from "./actions";
import { CronEditor } from "./_components/cron-editor";
import type { JobRunRecord } from "@/lib/scheduler/types";

// Server's real resolved IANA zone (Intl, not assumed UTC) — jobs with no
// `timezone` set run on this, per JobDefinition.timezone's JSDoc in
// src/lib/scheduler/types.ts (cron-parser's confirmed default is the
// process's local system timezone, not UTC).
const SERVER_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

function timezoneLabel(key: string): string {
  const timezone = JOB_DEFINITIONS.find((job) => job.key === key)?.timezone;
  return timezone ?? `Server default (${SERVER_TIMEZONE})`;
}

const STATUS_VARIANT: Record<JobRunRecord["status"], "default" | "secondary" | "outline" | "accent"> = {
  SUCCESS: "accent",
  RUNNING: "secondary",
  RETRYING: "outline",
  FAILED: "default",
};

function formatDateTime(date: Date | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function durationLabel(run: JobRunRecord): string {
  if (!run.finishedAt) return "running…";
  const ms = new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime();
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

const PRIORITY_LABEL: Record<number, string> = {
  1: "P1 · Critical",
  2: "P2 · High",
  3: "P3 · Normal",
  4: "P4 · Low",
  5: "P5 · Background",
};

function priorityBadge(priority: number | null): { label: string; variant: "default" | "secondary" | "outline" | "accent" } {
  if (priority === null) return { label: "No priority", variant: "outline" };
  return { label: PRIORITY_LABEL[priority] ?? `P${priority}`, variant: priority <= 2 ? "default" : priority === 3 ? "secondary" : "outline" };
}

function ageLabel(timestamp: number): string {
  const ms = Date.now() - timestamp;
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

export default async function JobsPage() {
  await requireActiveMembership("/dashboard/settings/jobs");

  const statuses = await scheduler.listStatuses();
  const jobsWithRuns = await Promise.all(
    statuses.map(async (status) => ({ status, runs: await scheduler.listRuns(status.key, 10) })),
  );
  const [queueStats, failedJobs] = await Promise.all([getQueueStats(), listFailedJobs()]);

  const running = jobsWithRuns.flatMap((j) => j.runs.filter((r) => r.status === "RUNNING").map((r) => ({ ...r, jobName: j.status.name })));
  const retrying = jobsWithRuns.flatMap((j) => j.runs.filter((r) => r.status === "RETRYING").map((r) => ({ ...r, jobName: j.status.name })));
  const failed = jobsWithRuns.flatMap((j) => j.runs.filter((r) => r.status === "FAILED").map((r) => ({ ...r, jobName: j.status.name })));

  return (
    <Container className="py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Background Jobs</h1>
          <p className="text-sm text-muted-foreground">
            Every recurring job the Scheduler Service runs, with real execution history — nothing here is simulated. Provider:
            BullMQ + Redis (see src/lib/scheduler/types.ts and providers/bullmq-provider.ts).
          </p>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Running</CardDescription>
            <CardTitle className="text-3xl">{running.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Retry queue</CardDescription>
            <CardTitle className="text-3xl">{retrying.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Failed (last 10 runs/job)</CardDescription>
            <CardTitle className="text-3xl">{failed.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="mb-8">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Queue (live from BullMQ)</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active</CardDescription>
              <CardTitle className="text-3xl">{queueStats.active}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Waiting</CardDescription>
              <CardTitle className="text-3xl">{queueStats.waiting}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Delayed</CardDescription>
              <CardTitle className="text-3xl">{queueStats.delayed}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Completed</CardDescription>
              <CardTitle className="text-3xl">{queueStats.completed}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Failed</CardDescription>
              <CardTitle className="text-3xl">{queueStats.failed}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      </div>

      <div className="space-y-6">
        {jobsWithRuns.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No jobs registered yet. The Scheduler Service registers jobs on server startup — restart the server if this looks wrong.
            </CardContent>
          </Card>
        )}

        {jobsWithRuns.map(({ status, runs }) => (
          <Card key={status.key}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {status.name}
                    <Badge variant={status.enabled ? "accent" : "outline"}>{status.enabled ? "Enabled" : "Paused"}</Badge>
                    <Badge variant={priorityBadge(status.priority).variant}>{priorityBadge(status.priority).label}</Badge>
                  </CardTitle>
                  <CardDescription className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="flex items-center gap-1.5">
                      <Clock className="size-3.5 shrink-0" />
                      <CronEditor jobKey={status.key} cronExpression={status.cronExpression} />
                    </span>
                    <span>Last run: {formatDateTime(status.lastRunAt)}</span>
                    <span>Next run: {formatDateTime(status.nextRunAt)}</span>
                    <span>
                      <Globe className="mr-1 inline size-3.5" />
                      {timezoneLabel(status.key)}
                    </span>
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <form action={async () => { "use server"; await runJobNow(status.key); }}>
                    <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent">
                      <Play className="size-3.5" /> Run now
                    </button>
                  </form>
                  {status.enabled ? (
                    <form action={async () => { "use server"; await pauseJob(status.key); }}>
                      <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent">
                        <Pause className="size-3.5" /> Pause
                      </button>
                    </form>
                  ) : (
                    <form action={async () => { "use server"; await resumeJob(status.key); }}>
                      <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent">
                        <RotateCcw className="size-3.5" /> Resume
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {runs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No runs yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-4">Status</th>
                        <th className="py-2 pr-4">Started</th>
                        <th className="py-2 pr-4">Duration</th>
                        <th className="py-2 pr-4">Attempt</th>
                        <th className="py-2">Log</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runs.map((run) => (
                        <tr key={run.id} className="border-b border-border/60 align-top">
                          <td className="py-2 pr-4">
                            <Badge variant={STATUS_VARIANT[run.status]}>{run.status}</Badge>
                          </td>
                          <td className="py-2 pr-4 text-muted-foreground">{formatDateTime(run.startedAt)}</td>
                          <td className="py-2 pr-4 text-muted-foreground">{durationLabel(run)}</td>
                          <td className="py-2 pr-4 text-muted-foreground">{run.attempt}</td>
                          <td className="py-2 text-muted-foreground">
                            {run.error && <p className="text-red-500">{run.error}</p>}
                            {run.logs?.map((log, i) => (
                              <p key={i} className={log.level === "error" ? "text-red-500" : log.level === "warn" ? "text-amber-500" : undefined}>
                                {log.message}
                              </p>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-10">
        <Card>
          <CardHeader>
            <CardTitle>Dead Letter Queue</CardTitle>
            <CardDescription>Jobs BullMQ moved to the failed set after exhausting all retries — real data from Redis, not simulated.</CardDescription>
          </CardHeader>
          <CardContent>
            {failedJobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No failed jobs.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-4">Job</th>
                      <th className="py-2 pr-4">Failure reason</th>
                      <th className="py-2 pr-4">Attempts</th>
                      <th className="py-2 pr-4">Age</th>
                      <th className="py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {failedJobs.map((job) => (
                      <tr key={job.id} className="border-b border-border/60 align-top">
                        <td className="py-2 pr-4 font-medium text-foreground">{job.name}</td>
                        <td className="py-2 pr-4 text-red-500">{job.failedReason}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{job.attemptsMade}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{ageLabel(job.timestamp)}</td>
                        <td className="py-2">
                          <div className="flex gap-2">
                            <form action={async () => { "use server"; await retryFailedJobAction(job.id); }}>
                              <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent">
                                <RefreshCw className="size-3.5" /> Retry
                              </button>
                            </form>
                            <form action={async () => { "use server"; await discardFailedJobAction(job.id); }}>
                              <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent">
                                <Trash2 className="size-3.5" /> Discard
                              </button>
                            </form>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Container>
  );
}
