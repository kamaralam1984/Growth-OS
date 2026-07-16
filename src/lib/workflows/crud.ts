import { prisma } from "@/lib/prisma";
import type { Prisma, Workflow, WorkflowStep, WorkflowRun, WorkflowStepRun } from "@/generated/prisma/client";
import type {
  CreateWorkflowInput,
  CreateWorkflowStepInput,
  UpdateWorkflowInput,
  UpdateWorkflowStepInput,
} from "@/lib/validations/workflows";

export type WorkflowWithSteps = Workflow & { steps: WorkflowStep[] };
export type WorkflowStepRunWithStep = WorkflowStepRun & { workflowStep: WorkflowStep };
export type WorkflowRunWithStepRuns = WorkflowRun & { stepRuns: WorkflowStepRunWithStep[] };

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export async function listWorkflows(organizationId: string): Promise<Workflow[]> {
  return prisma.workflow.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getWorkflowWithSteps(workflowId: string): Promise<WorkflowWithSteps> {
  const workflow = await prisma.workflow.findUnique({
    where: { id: workflowId },
    include: { steps: { orderBy: { createdAt: "asc" } } },
  });
  if (!workflow) throw new Error("Workflow not found.");
  return workflow;
}

/** Real run history for a workflow, most recent first — every row is a genuine startWorkflowRun() call from src/lib/workflows/engine.ts. */
export async function listWorkflowRuns(workflowId: string): Promise<WorkflowRun[]> {
  return prisma.workflowRun.findMany({
    where: { workflowId },
    orderBy: { createdAt: "desc" },
  });
}

/** A single run's real per-step execution trace, ordered the way the engine actually walked the DAG (startedAt asc; steps the engine never reached sort last). */
export async function getWorkflowRunWithStepRuns(runId: string): Promise<WorkflowRunWithStepRuns | null> {
  return prisma.workflowRun.findUnique({
    where: { id: runId },
    include: {
      stepRuns: {
        orderBy: [{ startedAt: { sort: "asc", nulls: "last" } }],
        include: { workflowStep: true },
      },
    },
  });
}

export async function createWorkflow(organizationId: string, userId: string | null, input: CreateWorkflowInput): Promise<Workflow> {
  return prisma.workflow.create({
    data: {
      organizationId,
      name: input.name,
      description: input.description || null,
      triggerType: input.triggerType,
      triggerConfig: input.triggerConfig ? toJson(input.triggerConfig) : undefined,
      createdByUserId: userId ?? undefined,
    },
  });
}

export async function updateWorkflow(workflowId: string, input: UpdateWorkflowInput): Promise<Workflow> {
  return prisma.workflow.update({
    where: { id: workflowId },
    data: {
      name: input.name,
      description: input.description === undefined ? undefined : input.description || null,
      status: input.status,
      triggerType: input.triggerType,
      triggerConfig: input.triggerConfig === undefined ? undefined : toJson(input.triggerConfig),
    },
  });
}

export async function deleteWorkflow(workflowId: string): Promise<void> {
  // Steps/runs cascade per schema (WorkflowStep.workflow, WorkflowRun.workflow
  // are both onDelete: Cascade) — nothing else to clean up here.
  await prisma.workflow.delete({ where: { id: workflowId } });
}

/**
 * Deep-copies a workflow and its steps into a brand-new DRAFT workflow. The
 * step DAG is expressed via real step-to-step id pointers (nextStepId,
 * onTrueStepId, onFalseStepId), and those ids don't exist until the new
 * steps are created — so this is a genuine two-pass copy:
 *   1. Create every new step first, with no pointers set, while building an
 *      old-step-id -> new-step-id map.
 *   2. Walk the original steps again and, for each pointer that was set on
 *      the original, set the matching pointer on the new step using the map.
 */
export async function duplicateWorkflow(workflowId: string, organizationId: string, userId: string | null): Promise<Workflow> {
  const original = await getWorkflowWithSteps(workflowId);

  const copy = await prisma.workflow.create({
    data: {
      organizationId,
      name: `${original.name} (copy)`,
      description: original.description,
      status: "DRAFT",
      triggerType: original.triggerType,
      triggerConfig: original.triggerConfig === null ? undefined : toJson(original.triggerConfig),
      isAIGenerated: original.isAIGenerated,
      aiPrompt: original.aiPrompt,
      createdByUserId: userId ?? undefined,
    },
  });

  const idMap = new Map<string, string>();
  for (const step of original.steps) {
    const newStep = await prisma.workflowStep.create({
      data: {
        workflowId: copy.id,
        nodeType: step.nodeType,
        name: step.name,
        config: toJson(step.config),
        position: toJson(step.position),
      },
    });
    idMap.set(step.id, newStep.id);
  }

  for (const step of original.steps) {
    const newId = idMap.get(step.id);
    if (!newId) continue;

    const data: Prisma.WorkflowStepUpdateInput = {};
    if (step.nextStepId && idMap.has(step.nextStepId)) {
      data.nextStep = { connect: { id: idMap.get(step.nextStepId)! } };
    }
    if (step.onTrueStepId && idMap.has(step.onTrueStepId)) {
      data.onTrueStep = { connect: { id: idMap.get(step.onTrueStepId)! } };
    }
    if (step.onFalseStepId && idMap.has(step.onFalseStepId)) {
      data.onFalseStep = { connect: { id: idMap.get(step.onFalseStepId)! } };
    }
    if (Object.keys(data).length > 0) {
      await prisma.workflowStep.update({ where: { id: newId }, data });
    }
  }

  return copy;
}

export async function addWorkflowStep(workflowId: string, input: CreateWorkflowStepInput): Promise<WorkflowStep> {
  return prisma.workflowStep.create({
    data: {
      workflowId,
      nodeType: input.nodeType,
      name: input.name,
      config: toJson(input.config ?? {}),
      position: toJson(input.position ?? { x: 0, y: 0 }),
    },
  });
}

export async function updateWorkflowStep(stepId: string, input: UpdateWorkflowStepInput): Promise<WorkflowStep> {
  return prisma.workflowStep.update({
    where: { id: stepId },
    data: {
      name: input.name,
      config: input.config === undefined ? undefined : toJson(input.config),
      position: input.position === undefined ? undefined : toJson(input.position),
    },
  });
}

/**
 * Deletes a step and nulls out any OTHER step's pointer that referenced it.
 * nextStepId/onTrueStepId/onFalseStepId are optional, non-cascading pointers
 * (unlike workflowId, which cascades), so a stale pointer left behind would
 * silently dangle — this keeps the DAG referentially clean.
 */
export async function deleteWorkflowStep(stepId: string): Promise<void> {
  await prisma.$transaction([
    prisma.workflowStep.updateMany({ where: { nextStepId: stepId }, data: { nextStepId: null } }),
    prisma.workflowStep.updateMany({ where: { onTrueStepId: stepId }, data: { onTrueStepId: null } }),
    prisma.workflowStep.updateMany({ where: { onFalseStepId: stepId }, data: { onFalseStepId: null } }),
    prisma.workflowStep.delete({ where: { id: stepId } }),
  ]);
}

export async function connectWorkflowSteps(fromStepId: string, toStepId: string, branch?: "true" | "false"): Promise<void> {
  const data: Prisma.WorkflowStepUpdateInput =
    branch === "true"
      ? { onTrueStep: { connect: { id: toStepId } } }
      : branch === "false"
        ? { onFalseStep: { connect: { id: toStepId } } }
        : { nextStep: { connect: { id: toStepId } } };

  await prisma.workflowStep.update({ where: { id: fromStepId }, data });
}
