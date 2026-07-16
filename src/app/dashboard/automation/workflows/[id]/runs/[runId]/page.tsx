import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { getWorkflowRunWithStepRuns } from "@/lib/workflows/crud";
import type { WorkflowRunStatus } from "@/generated/prisma/client";

const STATUS_VARIANT: Record<WorkflowRunStatus, "default" | "secondary" | "outline" | "accent"> = {
  QUEUED: "outline",
  RUNNING: "secondary",
  SUCCESS: "accent",
  FAILED: "default",
  CANCELLED: "outline",
};

function formatDateTime(date: Date | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function durationLabel(startedAt: Date | null, finishedAt: Date | null): string {
  if (!startedAt) return "—";
  if (!finishedAt) return "running…";
  const ms = finishedAt.getTime() - startedAt.getTime();
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function JsonDetails({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) {
    return <p className="text-xs text-muted-foreground">{label}: —</p>;
  }
  const json = JSON.stringify(value);
  const preview = json.length > 80 ? `${json.slice(0, 80)}…` : json;
  return (
    <details>
      <summary className="cursor-pointer text-xs text-muted-foreground">
        {label}: {preview}
      </summary>
      <pre className="mt-2 overflow-x-auto rounded-lg bg-muted p-3 text-xs">{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}

export default async function WorkflowRunDetailPage({
  params,
}: {
  params: Promise<{ id: string; runId: string }>;
}) {
  const { id, runId } = await params;
  const { membership } = await requireActiveMembership(`/dashboard/automation/workflows/${id}/runs/${runId}`);

  const run = await getWorkflowRunWithStepRuns(runId);
  if (!run || run.workflowId !== id || run.organizationId !== membership.organizationId) {
    notFound();
  }

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div>
          <Link
            href={`/dashboard/automation/workflows/${id}/runs`}
            className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> Back to run history
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Run {run.id}</h1>
            <Badge variant={STATUS_VARIANT[run.status]}>{run.status}</Badge>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
            <CardDescription>
              The real WorkflowRun row this trace was built from — every field below is exactly what
              src/lib/workflows/engine.ts wrote.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Started</span>
              <span className="text-sm text-foreground">{formatDateTime(run.startedAt)}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Finished</span>
              <span className="text-sm text-foreground">{formatDateTime(run.finishedAt)}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Duration</span>
              <span className="text-sm text-foreground">{durationLabel(run.startedAt, run.finishedAt)}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Queue job</span>
              <span className="text-sm text-foreground">{run.queueJobId ?? "—"}</span>
            </div>
            <div className="sm:col-span-2">
              <JsonDetails label="Trigger payload" value={run.triggerPayload} />
            </div>
            {run.error && (
              <div className="sm:col-span-2">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Error</span>
                <p className="mt-1 whitespace-pre-wrap text-sm text-red-500">{run.error}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-foreground">Step trace</h2>
          <p className="-mt-2 text-sm text-muted-foreground">
            Every real WorkflowStepRun for this run, in the order the engine actually executed them.
          </p>

          {run.stepRuns.length === 0 ? (
            <Card glass>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                No steps have run yet for this run.
              </CardContent>
            </Card>
          ) : (
            <ol className="flex flex-col gap-3">
              {run.stepRuns.map((stepRun, index) => (
                <li key={stepRun.id}>
                  <Card>
                    <CardHeader>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <CardTitle className="flex items-center gap-2 text-base">
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                            {index + 1}
                          </span>
                          {stepRun.workflowStep.name}
                          <Badge variant="outline">{stepRun.workflowStep.nodeType}</Badge>
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          <Badge variant={STATUS_VARIANT[stepRun.status]}>{stepRun.status}</Badge>
                          {stepRun.attempt > 1 && <Badge variant="outline">attempt {stepRun.attempt}</Badge>}
                        </div>
                      </div>
                      <CardDescription className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        <span>Started: {formatDateTime(stepRun.startedAt)}</span>
                        <span>Finished: {formatDateTime(stepRun.finishedAt)}</span>
                        <span>Duration: {durationLabel(stepRun.startedAt, stepRun.finishedAt)}</span>
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-2">
                      <JsonDetails label="Input" value={stepRun.input} />
                      <JsonDetails label="Output" value={stepRun.output} />
                      {stepRun.error && (
                        <p className="whitespace-pre-wrap text-sm text-red-500">{stepRun.error}</p>
                      )}
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ol>
          )}
        </div>
      </Container>
    </main>
  );
}
