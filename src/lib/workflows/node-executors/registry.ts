import type { WorkflowNodeType } from "@/generated/prisma/client";
import type { NodeExecutor, NodeExecutorMap } from "./types";

/**
 * Every real node executor registers here. Individual node-type
 * implementations live in their own files (control-flow.ts, communication.ts,
 * business.ts, ai-and-data.ts) and export a NodeExecutorMap object each —
 * this file only imports and merges them, kept intentionally tiny/mechanical
 * to minimize merge risk as node types are added over time.
 */
import { CONTROL_FLOW_EXECUTORS } from "./control-flow";
import { COMMUNICATION_EXECUTORS } from "./communication";
import { BUSINESS_EXECUTORS } from "./business";
import { AI_AND_DATA_EXECUTORS } from "./ai-and-data";

const EXECUTORS: NodeExecutorMap = {
  ...CONTROL_FLOW_EXECUTORS,
  ...COMMUNICATION_EXECUTORS,
  ...BUSINESS_EXECUTORS,
  ...AI_AND_DATA_EXECUTORS,
};

export function getNodeExecutor(nodeType: WorkflowNodeType): NodeExecutor | null {
  return EXECUTORS[nodeType] ?? null;
}
