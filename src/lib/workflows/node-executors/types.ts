import type { WorkflowNodeType } from "@/generated/prisma/client";

/**
 * The shared contract every WorkflowNodeType implementation follows. The
 * execution engine (src/lib/workflows/engine.ts) is the ONLY caller — node
 * executors never call each other or walk the DAG themselves, they just do
 * one real unit of work and return.
 */
export interface NodeExecutionContext {
  organizationId: string;
  workflowRunId: string;
  workflowStepId: string;
  /** The real event payload that started this run (webhook body, entity snapshot, cron tick, manual input) — verbatim, never fabricated. */
  triggerPayload: Record<string, unknown>;
  /** Real output from every previously-executed step in this run, keyed by WorkflowStep.id — lets a later node reference an earlier node's real result. */
  stepOutputs: Record<string, unknown>;
}

export interface NodeExecutionResult {
  /** Real data this node produced, merged into stepOutputs for later nodes. Null when the node genuinely has no output (e.g. a NOTIFICATION send). */
  output: Record<string, unknown> | null;
  /** Only meaningful for CONDITION nodes — which branch the engine should follow next. Every other node type leaves this undefined and the engine follows nextStepId. */
  branch?: "true" | "false";
  /** Set by DELAY nodes that need the engine to suspend this run and resume later via a real BullMQ delayed job — never a busy-wait/setTimeout. */
  resumeAt?: Date;
}

/** A node executor must throw a real Error on genuine failure — the engine records it honestly on WorkflowStepRun.error, never swallows it into a fake success. */
export type NodeExecutor = (config: Record<string, unknown>, context: NodeExecutionContext) => Promise<NodeExecutionResult>;

export type NodeExecutorMap = Partial<Record<WorkflowNodeType, NodeExecutor>>;
