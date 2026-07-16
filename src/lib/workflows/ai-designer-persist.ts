import { addWorkflowStep, connectWorkflowSteps, createWorkflow, deleteWorkflow } from "./crud";
import type { AutomationTrigger, WorkflowNodeType } from "@/generated/prisma/client";

// Mirrors the WorkflowPlan/WorkflowPlanStep contract exported by
// src/lib/workflows/ai-designer.ts (generateWorkflowPlan) — defined locally
// here since that sibling file lands from a parallel batch of work. Re-check
// against the real export before treating this as final; swap to a re-export
// (`export type { WorkflowPlan, WorkflowPlanStep } from "./ai-designer"`) once
// it exists and the shapes match.
export interface WorkflowPlanStep {
  tempId: string;
  nodeType: WorkflowNodeType;
  name: string;
  config: Record<string, unknown>;
  next?: string;
  onTrue?: string;
  onFalse?: string;
}

export interface WorkflowPlan {
  name: string;
  description: string;
  triggerType: AutomationTrigger;
  steps: WorkflowPlanStep[];
}

// Canvas geometry constants — chosen to match workflow-canvas.tsx's node
// width (w-56 = 224px) plus breathing room, so an AI-generated graph never
// renders with overlapping/touching nodes.
const LAYER_HEIGHT = 180;
const NODE_X_SPACING = 320;
// A CONDITION node's onTrue/onFalse targets get nudged left/right of the
// grid column they land in so the two branches visually diverge instead of
// both dropping straight down under the CONDITION node.
const BRANCH_X_BIAS = 70;

/**
 * Real topological BFS layering from the TRIGGER step: layer 0 is the
 * trigger, layer N holds every step first reached N hops away via
 * next/onTrue/onFalse. Within a layer, nodes are ordered by the kind of edge
 * that first reached them (onTrue biases left, onFalse biases right, next
 * stays centered) and spread horizontally at NODE_X_SPACING apart, with the
 * branch bias applied as a small offset on top of that grid position — so
 * positions are always distinct (spacing dominates the bias) and layers
 * never overlap vertically. Steps unreachable from the trigger (a malformed
 * plan) still get a real, non-overlapping position: appended as trailing
 * layers in their original plan order, never left at a fabricated (0, 0).
 */
function computeLayout(steps: WorkflowPlanStep[]): Map<string, { x: number; y: number }> {
  const byId = new Map(steps.map((step) => [step.tempId, step]));
  const root = steps[0];
  if (!root || root.nodeType !== "TRIGGER") {
    throw new Error("A workflow plan's first step must be a TRIGGER node.");
  }

  const layerOf = new Map<string, number>();
  const hintOf = new Map<string, number>();
  const discoveryOrder: string[] = [];

  layerOf.set(root.tempId, 0);
  hintOf.set(root.tempId, 0);
  discoveryOrder.push(root.tempId);

  const queue: string[] = [root.tempId];
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const current = byId.get(currentId);
    if (!current) continue;
    const currentLayer = layerOf.get(currentId)!;

    const outgoing: Array<{ to: string | undefined; hint: number }> = [
      { to: current.next, hint: 0 },
      { to: current.onTrue, hint: -1 },
      { to: current.onFalse, hint: 1 },
    ];

    for (const edge of outgoing) {
      if (!edge.to || !byId.has(edge.to) || layerOf.has(edge.to)) continue;
      layerOf.set(edge.to, currentLayer + 1);
      hintOf.set(edge.to, edge.hint);
      discoveryOrder.push(edge.to);
      queue.push(edge.to);
    }
  }

  let trailingLayer = 0;
  for (const layer of layerOf.values()) trailingLayer = Math.max(trailingLayer, layer);
  for (const step of steps) {
    if (layerOf.has(step.tempId)) continue;
    trailingLayer += 1;
    layerOf.set(step.tempId, trailingLayer);
    hintOf.set(step.tempId, 0);
    discoveryOrder.push(step.tempId);
  }

  const idsByLayer = new Map<number, string[]>();
  for (const id of discoveryOrder) {
    const layer = layerOf.get(id)!;
    const bucket = idsByLayer.get(layer) ?? [];
    bucket.push(id);
    idsByLayer.set(layer, bucket);
  }

  const positions = new Map<string, { x: number; y: number }>();
  for (const [layer, ids] of idsByLayer) {
    const ordered = [...ids].sort((a, b) => (hintOf.get(a) ?? 0) - (hintOf.get(b) ?? 0));
    ordered.forEach((id, index) => {
      positions.set(id, {
        x: index * NODE_X_SPACING + (hintOf.get(id) ?? 0) * BRANCH_X_BIAS,
        y: layer * LAYER_HEIGHT,
      });
    });
  }

  return positions;
}

/**
 * Persists an AI-generated WorkflowPlan as a real Workflow + WorkflowStep
 * graph. Always lands as status DRAFT (createWorkflow's schema default) —
 * an AI-authored plan must be reviewed and explicitly activated by a human
 * before it can run against real trigger events; this function never
 * activates a workflow itself.
 *
 * Two-pass creation, mirroring duplicateWorkflow's pointer-remapping
 * pattern in crud.ts: pass 1 creates every WorkflowStep row (real
 * nodeType/name/config/computed position, no pointers yet) while building a
 * tempId -> real DB id map; pass 2 walks the plan again and, for each
 * next/onTrue/onFalse pointer, resolves the tempId through that map and
 * wires it up via connectWorkflowSteps. crud.ts's helpers operate on the
 * global prisma client with no passed-transaction-client support, so this
 * follows the same best-effort sequential pattern already used by
 * duplicateWorkflow and convertWonDealToProject: if anything fails partway
 * through, the partially-created Workflow (and its already-created steps,
 * which cascade-delete with it) is cleaned up before the error is rethrown.
 */
export async function createWorkflowFromPlan(
  organizationId: string,
  createdByUserId: string,
  plan: WorkflowPlan,
): Promise<{ workflowId: string }> {
  const positions = computeLayout(plan.steps);

  const workflow = await createWorkflow(organizationId, createdByUserId, {
    name: plan.name,
    description: plan.description,
    triggerType: plan.triggerType,
  });

  try {
    const idMap = new Map<string, string>();
    for (const step of plan.steps) {
      const created = await addWorkflowStep(workflow.id, {
        workflowId: workflow.id,
        nodeType: step.nodeType,
        name: step.name,
        config: step.config,
        position: positions.get(step.tempId) ?? { x: 0, y: 0 },
      });
      idMap.set(step.tempId, created.id);
    }

    for (const step of plan.steps) {
      const fromId = idMap.get(step.tempId);
      if (!fromId) continue;

      const pointers: Array<{ tempId: string | undefined; branch?: "true" | "false" }> = [
        { tempId: step.next },
        { tempId: step.onTrue, branch: "true" },
        { tempId: step.onFalse, branch: "false" },
      ];

      for (const pointer of pointers) {
        if (!pointer.tempId) continue;
        const toId = idMap.get(pointer.tempId);
        if (!toId) {
          throw new Error(
            `Workflow plan is malformed: step "${step.tempId}" points to unknown tempId "${pointer.tempId}".`,
          );
        }
        await connectWorkflowSteps(fromId, toId, pointer.branch);
      }
    }

    return { workflowId: workflow.id };
  } catch (error) {
    await deleteWorkflow(workflow.id).catch(() => {});
    throw error;
  }
}
