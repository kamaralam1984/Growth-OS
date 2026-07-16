"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requirePlatformOwner, getOrCreatePlatformOrganization } from "@/lib/billing/platform-admin";
import { logAudit } from "@/lib/audit";
import {
  createWorkflowSchema,
  updateWorkflowSchema,
  createWorkflowStepSchema,
  updateWorkflowStepSchema,
  connectWorkflowStepsSchema,
  type CreateWorkflowInput,
  type UpdateWorkflowInput,
  type CreateWorkflowStepInput,
  type UpdateWorkflowStepInput,
} from "@/lib/validations/workflows";
import * as workflowCrud from "@/lib/workflows/crud";
import { startWorkflowRun } from "@/lib/workflows/engine";
import type { Workflow } from "@/generated/prisma/client";

/**
 * Platform-scoped counterpart to src/app/dashboard/automation/actions.ts —
 * same crud.ts/engine.ts calls, but gated via requirePlatformOwner() instead
 * of requireEditableMembership() (which requires a real, active Membership
 * row — a platform owner has none by default) and scoped to the one real
 * "platform" Organization every admin-authored Workflow belongs to (see
 * getOrCreatePlatformOrganization's doc comment), never to whatever org a
 * cookie happens to point at.
 *
 * Deliberately narrower than the tenant version: no plan-limit check on
 * startWorkflowRunAction (this org has no BillingAccount/Plan — nothing to
 * limit), no webhook actions, no AI-designer actions — out of scope for the
 * admin builder's first pass. Every ActionResult shape matches the tenant
 * version's so the reused client components (workflow-form.tsx et al.) work
 * unmodified against these.
 */
export interface ActionResult {
  ok: boolean;
  error?: string;
}

const WORKFLOW_LIST_PATH = "/admin/automation";

function workflowDetailPath(workflowId: string): string {
  return `/admin/automation/${workflowId}`;
}

async function requirePlatformWorkflow(organizationId: string, workflowId: string): Promise<Workflow | null> {
  const workflow = await prisma.workflow.findUnique({ where: { id: workflowId } });
  if (!workflow || workflow.organizationId !== organizationId) return null;
  return workflow;
}

async function requirePlatformWorkflowStep(organizationId: string, stepId: string) {
  const step = await prisma.workflowStep.findUnique({ where: { id: stepId }, include: { workflow: true } });
  if (!step || step.workflow.organizationId !== organizationId) return null;
  return step;
}

export interface CreateWorkflowResult extends ActionResult {
  workflowId?: string;
}

export async function createWorkflowAction(input: CreateWorkflowInput): Promise<CreateWorkflowResult> {
  const { userId } = await requirePlatformOwner(WORKFLOW_LIST_PATH);

  const parsed = createWorkflowSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the workflow details." };
  }

  const org = await getOrCreatePlatformOrganization();

  try {
    const workflow = await workflowCrud.createWorkflow(org.id, userId, parsed.data);
    await logAudit({ userId, organizationId: org.id, action: "admin.automation.workflow_created", metadata: { workflowId: workflow.id } });
    revalidatePath(WORKFLOW_LIST_PATH);
    return { ok: true, workflowId: workflow.id };
  } catch (error) {
    console.error("[admin/automation] createWorkflowAction failed:", error);
    return { ok: false, error: "Something went wrong creating the workflow. Please try again." };
  }
}

export async function updateWorkflowAction(workflowId: string, input: UpdateWorkflowInput): Promise<ActionResult> {
  const { userId } = await requirePlatformOwner(WORKFLOW_LIST_PATH);

  const parsed = updateWorkflowSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the workflow details." };
  }

  const org = await getOrCreatePlatformOrganization();
  const workflow = await requirePlatformWorkflow(org.id, workflowId);
  if (!workflow) return { ok: false, error: "Workflow not found." };

  try {
    await workflowCrud.updateWorkflow(workflowId, parsed.data);
    await logAudit({ userId, organizationId: org.id, action: "admin.automation.workflow_updated", metadata: { workflowId } });
    revalidatePath(WORKFLOW_LIST_PATH);
    revalidatePath(workflowDetailPath(workflowId));
    return { ok: true };
  } catch (error) {
    console.error("[admin/automation] updateWorkflowAction failed:", error);
    return { ok: false, error: "Something went wrong updating the workflow. Please try again." };
  }
}

export async function setWorkflowStatusAction(workflowId: string, status: UpdateWorkflowInput["status"]): Promise<ActionResult> {
  return updateWorkflowAction(workflowId, { status });
}

export async function deleteWorkflowAction(workflowId: string): Promise<ActionResult> {
  const { userId } = await requirePlatformOwner(WORKFLOW_LIST_PATH);

  const org = await getOrCreatePlatformOrganization();
  const workflow = await requirePlatformWorkflow(org.id, workflowId);
  if (!workflow) return { ok: false, error: "Workflow not found." };

  try {
    await workflowCrud.deleteWorkflow(workflowId);
    await logAudit({ userId, organizationId: org.id, action: "admin.automation.workflow_deleted", metadata: { workflowId } });
    revalidatePath(WORKFLOW_LIST_PATH);
    return { ok: true };
  } catch (error) {
    console.error("[admin/automation] deleteWorkflowAction failed:", error);
    return { ok: false, error: "Something went wrong deleting the workflow. Please try again." };
  }
}

export async function duplicateWorkflowAction(workflowId: string): Promise<CreateWorkflowResult> {
  const { userId } = await requirePlatformOwner(WORKFLOW_LIST_PATH);

  const org = await getOrCreatePlatformOrganization();
  const workflow = await requirePlatformWorkflow(org.id, workflowId);
  if (!workflow) return { ok: false, error: "Workflow not found." };

  try {
    const copy = await workflowCrud.duplicateWorkflow(workflowId, org.id, userId);
    await logAudit({ userId, organizationId: org.id, action: "admin.automation.workflow_duplicated", metadata: { workflowId, copyId: copy.id } });
    revalidatePath(WORKFLOW_LIST_PATH);
    return { ok: true, workflowId: copy.id };
  } catch (error) {
    console.error("[admin/automation] duplicateWorkflowAction failed:", error);
    return { ok: false, error: "Something went wrong duplicating the workflow. Please try again." };
  }
}

export interface AddWorkflowStepResult extends ActionResult {
  stepId?: string;
}

export async function addWorkflowStepAction(input: CreateWorkflowStepInput): Promise<AddWorkflowStepResult> {
  const { userId } = await requirePlatformOwner(WORKFLOW_LIST_PATH);

  const parsed = createWorkflowStepSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the step details." };
  }

  const org = await getOrCreatePlatformOrganization();
  const workflow = await requirePlatformWorkflow(org.id, parsed.data.workflowId);
  if (!workflow) return { ok: false, error: "Workflow not found." };

  try {
    const step = await workflowCrud.addWorkflowStep(parsed.data.workflowId, parsed.data);
    await logAudit({ userId, organizationId: org.id, action: "admin.automation.workflow_step_added", metadata: { workflowId: workflow.id, stepId: step.id } });
    revalidatePath(workflowDetailPath(workflow.id));
    return { ok: true, stepId: step.id };
  } catch (error) {
    console.error("[admin/automation] addWorkflowStepAction failed:", error);
    return { ok: false, error: "Something went wrong adding the step. Please try again." };
  }
}

export async function updateWorkflowStepAction(stepId: string, input: UpdateWorkflowStepInput): Promise<ActionResult> {
  const { userId } = await requirePlatformOwner(WORKFLOW_LIST_PATH);

  const parsed = updateWorkflowStepSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the step details." };
  }

  const org = await getOrCreatePlatformOrganization();
  const step = await requirePlatformWorkflowStep(org.id, stepId);
  if (!step) return { ok: false, error: "Step not found." };

  try {
    await workflowCrud.updateWorkflowStep(stepId, parsed.data);
    await logAudit({ userId, organizationId: org.id, action: "admin.automation.workflow_step_updated", metadata: { workflowId: step.workflowId, stepId } });
    revalidatePath(workflowDetailPath(step.workflowId));
    return { ok: true };
  } catch (error) {
    console.error("[admin/automation] updateWorkflowStepAction failed:", error);
    return { ok: false, error: "Something went wrong updating the step. Please try again." };
  }
}

export async function deleteWorkflowStepAction(stepId: string): Promise<ActionResult> {
  const { userId } = await requirePlatformOwner(WORKFLOW_LIST_PATH);

  const org = await getOrCreatePlatformOrganization();
  const step = await requirePlatformWorkflowStep(org.id, stepId);
  if (!step) return { ok: false, error: "Step not found." };

  try {
    await workflowCrud.deleteWorkflowStep(stepId);
    await logAudit({ userId, organizationId: org.id, action: "admin.automation.workflow_step_deleted", metadata: { workflowId: step.workflowId, stepId } });
    revalidatePath(workflowDetailPath(step.workflowId));
    return { ok: true };
  } catch (error) {
    console.error("[admin/automation] deleteWorkflowStepAction failed:", error);
    return { ok: false, error: "Something went wrong deleting the step. Please try again." };
  }
}

export async function connectWorkflowStepsAction(fromStepId: string, toStepId: string, branch?: "true" | "false"): Promise<ActionResult> {
  await requirePlatformOwner(WORKFLOW_LIST_PATH);

  const parsed = connectWorkflowStepsSchema.safeParse({ fromStepId, toStepId, branch });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the connection." };
  }

  const org = await getOrCreatePlatformOrganization();
  const fromStep = await requirePlatformWorkflowStep(org.id, parsed.data.fromStepId);
  if (!fromStep) return { ok: false, error: "Step not found." };
  const toStep = await requirePlatformWorkflowStep(org.id, parsed.data.toStepId);
  if (!toStep || toStep.workflowId !== fromStep.workflowId) {
    return { ok: false, error: "Both steps must belong to the same workflow." };
  }

  try {
    await workflowCrud.connectWorkflowSteps(parsed.data.fromStepId, parsed.data.toStepId, parsed.data.branch);
    revalidatePath(workflowDetailPath(fromStep.workflowId));
    return { ok: true };
  } catch (error) {
    console.error("[admin/automation] connectWorkflowStepsAction failed:", error);
    return { ok: false, error: "Something went wrong connecting the steps. Please try again." };
  }
}

export interface StartWorkflowRunResult extends ActionResult {
  runId?: string;
}

export async function startWorkflowRunAction(workflowId: string): Promise<StartWorkflowRunResult> {
  const { userId } = await requirePlatformOwner(WORKFLOW_LIST_PATH);

  const org = await getOrCreatePlatformOrganization();
  const workflow = await requirePlatformWorkflow(org.id, workflowId);
  if (!workflow) return { ok: false, error: "Workflow not found." };

  const steps = await prisma.workflowStep.findMany({ where: { workflowId } });
  if (!steps.some((s) => s.nodeType === "TRIGGER")) {
    return { ok: false, error: "This workflow has no Trigger node yet — add one before running it." };
  }

  try {
    const runId = await startWorkflowRun(workflowId, org.id, {
      triggeredBy: "manual",
      triggeredByUserId: userId,
      triggeredAt: new Date().toISOString(),
    });
    await logAudit({ userId, organizationId: org.id, action: "admin.automation.workflow_run_started", metadata: { workflowId, runId } });
    revalidatePath(workflowDetailPath(workflowId));
    return { ok: true, runId };
  } catch (error) {
    console.error("[admin/automation] startWorkflowRunAction failed:", error);
    return { ok: false, error: "Something went wrong starting the run. Please try again." };
  }
}
