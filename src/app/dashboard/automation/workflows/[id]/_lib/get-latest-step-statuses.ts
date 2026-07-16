import { prisma } from "@/lib/prisma";

export interface LatestStepStatus {
  status: string;
  finishedAt: Date | null;
  error: string | null;
}

/**
 * Real per-step execution status for the canvas — keyed by workflowStepId,
 * sourced from the most recent real WorkflowRun's real WorkflowStepRun rows
 * (the only writer is src/lib/workflows/engine.ts's runStep). A step that
 * has no entry has never run in the latest run — the canvas renders nothing
 * for it (a genuine "no data" state, never a fabricated neutral badge).
 *
 * Only the latest run is considered: older runs' step statuses would be
 * stale/misleading overlaid on the current canvas, same reasoning the
 * run-history pages already use "most recent first" for.
 */
export async function getLatestStepStatuses(workflowId: string): Promise<Record<string, LatestStepStatus>> {
  const latestRun = await prisma.workflowRun.findFirst({
    where: { workflowId },
    orderBy: { createdAt: "desc" },
    include: {
      stepRuns: {
        orderBy: [{ startedAt: { sort: "asc", nulls: "last" } }],
      },
    },
  });
  if (!latestRun) return {};

  const statuses: Record<string, LatestStepStatus> = {};
  for (const stepRun of latestRun.stepRuns) {
    // Ascending order means a later iteration (a retried attempt) overwrites
    // an earlier one, so each step id ends up holding its real latest attempt.
    statuses[stepRun.workflowStepId] = {
      status: stepRun.status,
      finishedAt: stepRun.finishedAt,
      error: stepRun.error,
    };
  }
  return statuses;
}
