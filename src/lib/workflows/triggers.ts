import { prisma } from "@/lib/prisma";
import { startWorkflowRun } from "./engine";
import type { AutomationTrigger } from "@/generated/prisma/client";

/**
 * The real entry point every genuine app event calls to fire matching
 * Workflows (src/lib/workflows/triggers-wiring — the call sites inside
 * existing action files, e.g. lead creation, deal-won, task-completed).
 * Never throws — firing a trigger must never break the real action that
 * fired it, same discipline as notifyUser/logActivity elsewhere in this
 * codebase. Only Workflow.status === "ACTIVE" rows are considered; DRAFT/
 * PAUSED/ARCHIVED workflows never run automatically.
 */
export async function fireWorkflowTrigger(
  organizationId: string,
  triggerType: AutomationTrigger,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const workflows = await prisma.workflow.findMany({
      where: { organizationId, status: "ACTIVE", triggerType },
      select: { id: true },
    });
    for (const workflow of workflows) {
      try {
        await startWorkflowRun(workflow.id, organizationId, payload);
      } catch (error) {
        console.error(`[workflows:triggers] failed to start run for workflow ${workflow.id} (trigger ${triggerType}):`, error);
      }
    }
  } catch (error) {
    console.error(`[workflows:triggers] failed to look up workflows for trigger ${triggerType}:`, error);
  }
}
