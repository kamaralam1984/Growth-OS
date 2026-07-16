"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { addWorkflowStepAction } from "../../../actions";
import { ALL_NODE_TYPES, NODE_TYPE_META, type NodeTypeMeta } from "../_lib/node-type-meta";
import type { WorkflowNodeType } from "@/generated/prisma/client";

/**
 * DataTransfer key a palette item's `dragstart` writes its node type into.
 * Canvas-side contract (see workflow-canvas.tsx's `handleDrop`): on `drop`,
 * read `event.dataTransfer.getData(WORKFLOW_NODE_TYPE_DRAG_KEY)`, convert the
 * client point to flow coordinates (`useReactFlow().screenToFlowPosition`),
 * and call `addWorkflowStepAction` with that node type/position.
 */
export const WORKFLOW_NODE_TYPE_DRAG_KEY = "application/x-growthos-workflow-node-type";

const ICON_CLASSES: Record<NodeTypeMeta["color"], string> = {
  emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500",
  blue: "border-blue-500/30 bg-blue-500/10 text-blue-500",
  purple: "border-purple-500/30 bg-purple-500/10 text-purple-500",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-500",
  rose: "border-rose-500/30 bg-rose-500/10 text-rose-500",
  neutral: "border-border bg-muted/50 text-muted-foreground",
};

export interface NodePaletteProps {
  workflowId: string;
  /** Current step count — used to stack click-added nodes in a simple cascade so they don't land on top of each other. */
  stepCount: number;
}

/**
 * Toolbar of every WorkflowNodeType a user can drop onto the canvas. Two
 * real ways to add a node, both landing a genuine `addWorkflowStepAction`
 * call: (1) HTML5 drag-and-drop onto the canvas (primary — see the
 * WORKFLOW_NODE_TYPE_DRAG_KEY contract above), and (2) click, which adds the
 * step immediately at a cascading default position — a fallback that works
 * even without a precise drop point (keyboard/touch users, or before a
 * canvas drop target exists).
 */
export function NodePalette({ workflowId, stepCount }: NodePaletteProps) {
  const router = useRouter();
  const [pendingType, setPendingType] = React.useState<WorkflowNodeType | null>(null);

  function addStep(nodeType: WorkflowNodeType, position: { x: number; y: number }) {
    setPendingType(nodeType);
    void (async () => {
      const result = await addWorkflowStepAction({
        workflowId,
        nodeType,
        name: NODE_TYPE_META[nodeType].label,
        config: {},
        position,
      });
      setPendingType(null);
      if (!result.ok) {
        toast.error(result.error ?? "Could not add step.");
        return;
      }
      router.refresh();
    })();
  }

  function handleDragStart(event: React.DragEvent<HTMLButtonElement>, nodeType: WorkflowNodeType) {
    event.dataTransfer.setData(WORKFLOW_NODE_TYPE_DRAG_KEY, nodeType);
    event.dataTransfer.effectAllowed = "move";
  }

  function handleClickAdd(nodeType: WorkflowNodeType) {
    const col = stepCount % 4;
    const row = Math.floor(stepCount / 4);
    addStep(nodeType, { x: 80 + col * 220, y: 40 + row * 150 });
  }

  return (
    <Card glass className="flex w-60 shrink-0 flex-col gap-1 overflow-y-auto p-3">
      <p className="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add a node</p>
      {ALL_NODE_TYPES.map((nodeType) => {
        const meta = NODE_TYPE_META[nodeType];
        const Icon = meta.icon;
        const isPending = pendingType === nodeType;
        return (
          <button
            key={nodeType}
            type="button"
            draggable
            onDragStart={(e) => handleDragStart(e, nodeType)}
            onClick={() => handleClickAdd(nodeType)}
            disabled={isPending}
            title={meta.description}
            className="flex cursor-grab items-center gap-2.5 rounded-lg border border-transparent px-2 py-2 text-left transition-colors hover:border-border hover:bg-accent active:cursor-grabbing disabled:pointer-events-none disabled:opacity-50"
          >
            <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg border ${ICON_CLASSES[meta.color]}`}>
              <Icon className="size-3.5" />
            </span>
            <span className="truncate text-xs font-medium text-foreground">{meta.label}</span>
          </button>
        );
      })}
    </Card>
  );
}
