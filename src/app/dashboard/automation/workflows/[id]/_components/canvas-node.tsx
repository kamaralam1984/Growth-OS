"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import { cn } from "@/lib/utils";
import { NODE_TYPE_META, type NodeTypeMeta } from "../_lib/node-type-meta";
import { NodeStatusBadge, type NodeRunStatus } from "./node-status-badge";
import type { WorkflowNodeType } from "@/generated/prisma/client";

export interface WorkflowCanvasNodeData extends Record<string, unknown> {
  step: {
    id: string;
    nodeType: WorkflowNodeType;
    name: string;
  };
  /** This node's real, latest WorkflowStepRun status — see get-latest-step-statuses.ts. Undefined means the step has never run. */
  stepStatus?: NodeRunStatus;
}

export type WorkflowCanvasNodeType = Node<WorkflowCanvasNodeData, "workflowNode">;

const ICON_COLOR_CLASSES: Record<NodeTypeMeta["color"], string> = {
  emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
  blue: "border-blue-500/30 bg-blue-500/10 text-blue-500",
  purple: "border-purple-500/30 bg-purple-500/10 text-purple-500",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-500",
  rose: "border-rose-500/30 bg-rose-500/10 text-rose-500",
  neutral: "border-border bg-muted/50 text-muted-foreground",
};

const HANDLE_BASE = "!size-2.5 !border-2 !border-background";

export function WorkflowCanvasNode({ data, selected }: NodeProps<WorkflowCanvasNodeType>) {
  const meta = NODE_TYPE_META[data.step.nodeType];
  const Icon = meta.icon;
  const isCondition = data.step.nodeType === "CONDITION";

  return (
    <div
      className={cn(
        "glass-panel relative w-56 rounded-2xl border px-3.5 py-3 shadow-card transition-colors",
        selected ? "border-primary ring-2 ring-primary/40" : "border-border",
      )}
    >
      <NodeStatusBadge stepStatus={data.stepStatus} />
      <Handle type="target" position={Position.Left} className={cn(HANDLE_BASE, "!bg-muted-foreground")} />

      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg border",
            ICON_COLOR_CLASSES[meta.color],
          )}
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{data.step.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">{meta.label}</p>
        </div>
      </div>

      {isCondition ? (
        <>
          <Handle
            type="source"
            id="true"
            position={Position.Right}
            style={{ top: "38%" }}
            className={cn(HANDLE_BASE, "!bg-emerald-500")}
          />
          <Handle
            type="source"
            id="false"
            position={Position.Right}
            style={{ top: "68%" }}
            className={cn(HANDLE_BASE, "!bg-rose-500")}
          />
        </>
      ) : (
        <Handle type="source" position={Position.Right} className={cn(HANDLE_BASE, "!bg-primary")} />
      )}
    </div>
  );
}
