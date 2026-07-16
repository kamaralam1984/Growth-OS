import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, XCircle, Timer } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { getWorkflowWithSteps, listWorkflowRuns } from "@/lib/workflows/crud";
import { cancelWorkflowRunAction } from "../../../actions";
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

function durationLabel(run: { startedAt: Date | null; finishedAt: Date | null }): string {
  if (!run.startedAt) return "—";
  if (!run.finishedAt) return "running…";
  const ms = run.finishedAt.getTime() - run.startedAt.getTime();
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function payloadPreview(payload: unknown): string {
  const json = JSON.stringify(payload);
  return json.length > 80 ? `${json.slice(0, 80)}…` : json;
}

export default async function WorkflowRunsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { membership } = await requireActiveMembership(`/dashboard/automation/workflows/${id}/runs`);
  const canManage = membership.role === "OWNER" || membership.role === "ADMIN";

  let workflow;
  try {
    workflow = await getWorkflowWithSteps(id);
  } catch {
    notFound();
  }
  if (!workflow || workflow.organizationId !== membership.organizationId) {
    notFound();
  }

  const runs = await listWorkflowRuns(id);

  const finished = runs.filter((r) => r.status === "SUCCESS" || r.status === "FAILED");
  const successCount = runs.filter((r) => r.status === "SUCCESS").length;
  const failedCount = runs.filter((r) => r.status === "FAILED").length;
  const successRatePct = finished.length > 0 ? (successCount / finished.length) * 100 : null;
  const durationsMs = finished
    .filter((r) => r.startedAt && r.finishedAt)
    .map((r) => r.finishedAt!.getTime() - r.startedAt!.getTime());
  const avgDurationMs = durationsMs.length > 0 ? durationsMs.reduce((sum, ms) => sum + ms, 0) / durationsMs.length : null;

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div>
          <Link
            href={`/dashboard/automation/workflows/${id}`}
            className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> Back to {workflow.name}
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Run history</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every real <code className="text-xs">WorkflowRun</code> the execution engine
            (src/lib/workflows/engine.ts) has created for this workflow — nothing here is simulated.{" "}
            {workflow.runCount} run{workflow.runCount === 1 ? "" : "s"} total.
          </p>
        </div>

        {runs.length === 0 ? (
          <Card glass>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No runs yet. This workflow hasn&apos;t been triggered.
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1.5">
                    <CheckCircle2 className="size-3.5" /> Success rate
                  </CardDescription>
                  <CardTitle className="text-3xl">
                    {successRatePct === null ? "—" : `${successRatePct.toFixed(0)}%`}
                  </CardTitle>
                  <CardDescription>
                    {successCount} succeeded{finished.length > 0 ? ` of ${finished.length} finished` : ""}
                  </CardDescription>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1.5">
                    <XCircle className="size-3.5" /> Failed runs
                  </CardDescription>
                  <CardTitle className={failedCount > 0 ? "text-3xl text-red-500" : "text-3xl"}>{failedCount}</CardTitle>
                  <CardDescription>out of {runs.length} total</CardDescription>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-1.5">
                    <Timer className="size-3.5" /> Avg duration
                  </CardDescription>
                  <CardTitle className="text-3xl">
                    {avgDurationMs === null ? "—" : avgDurationMs < 1000 ? `${Math.round(avgDurationMs)}ms` : `${(avgDurationMs / 1000).toFixed(1)}s`}
                  </CardTitle>
                  <CardDescription>across {durationsMs.length} finished run{durationsMs.length === 1 ? "" : "s"}</CardDescription>
                </CardHeader>
              </Card>
            </div>

            <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Trigger payload</th>
                  <th className="py-2 pr-4">Started</th>
                  <th className="py-2 pr-4">Finished</th>
                  <th className="py-2 pr-4">Duration</th>
                  <th className="py-2 pr-4">Error</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-b border-border/60 align-top">
                    <td className="py-3 pr-4">
                      <Badge variant={STATUS_VARIANT[run.status]}>{run.status}</Badge>
                    </td>
                    <td className="max-w-xs py-3 pr-4">
                      {run.triggerPayload ? (
                        <details>
                          <summary className="cursor-pointer text-xs text-muted-foreground">
                            {payloadPreview(run.triggerPayload)}
                          </summary>
                          <pre className="mt-2 overflow-x-auto rounded-lg bg-muted p-3 text-xs">
                            {JSON.stringify(run.triggerPayload, null, 2)}
                          </pre>
                        </details>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">{formatDateTime(run.startedAt)}</td>
                    <td className="py-3 pr-4 text-muted-foreground">{formatDateTime(run.finishedAt)}</td>
                    <td className="py-3 pr-4 text-muted-foreground">{durationLabel(run)}</td>
                    <td className="max-w-xs py-3 pr-4 text-red-500">{run.error ?? ""}</td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/dashboard/automation/workflows/${id}/runs/${run.id}`}
                          className="text-xs font-medium text-foreground hover:underline"
                        >
                          View trace
                        </Link>
                        {canManage && (run.status === "RUNNING" || run.status === "QUEUED") && (
                          <form
                            action={async () => {
                              "use server";
                              await cancelWorkflowRunAction(run.id);
                            }}
                          >
                            <Button type="submit" variant="outline" size="sm">
                              Cancel
                            </Button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </>
        )}
      </Container>
    </main>
  );
}
