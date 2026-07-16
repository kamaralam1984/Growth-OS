"use client";

/**
 * Integration point for the property-panel / toolbar work on this same page:
 * this component is fully controlled from the outside for selection —
 *   - `onNodeSelect(step | null)` fires on every node click (the clicked
 *     step's plain data, matching `WorkflowCanvasStep` below) and on pane
 *     click / Escape (`null`), so a property panel can render whatever is
 *     currently selected.
 *   - `selectedStepId` lets the canvas be told "this step is selected" from
 *     elsewhere (e.g. a step picked in a list/panel instead of on the
 *     canvas) and will highlight the matching node.
 * Both props are optional — the canvas works standalone without them.
 *
 * Add-node / connect / delete integration (this batch): `canManage` gates
 * all three real mutations below —
 *   - Dropping a palette item (see node-palette.tsx's WORKFLOW_NODE_TYPE_DRAG_KEY
 *     contract) calls `addWorkflowStepAction` at the exact drop point.
 *   - Dragging an edge between two node handles fires xyflow's real
 *     `onConnect`; `connection.sourceHandle` is `"true"`/`"false"` for a
 *     CONDITION node's two source handles (see canvas-node.tsx) or `null`
 *     for every other node type's single source handle, and maps 1:1 to
 *     `connectWorkflowStepsAction`'s `branch` param.
 *   - Pressing Delete/Backspace with a node selected confirms via
 *     `onBeforeDelete`, then calls `deleteWorkflowStepAction` for each
 *     confirmed node in `onNodesDelete`.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  MarkerType,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Connection,
  type Edge,
  type NodeMouseHandler,
  type OnBeforeDelete,
  type OnConnect,
  type OnNodeDrag,
  type OnNodesDelete,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { addWorkflowStepAction, connectWorkflowStepsAction, deleteWorkflowStepAction, updateWorkflowStepAction } from "../../actions";
import { WorkflowCanvasNode, type WorkflowCanvasNodeType, type WorkflowCanvasNodeData } from "./canvas-node";
import type { NodeRunStatus } from "./node-status-badge";
import { NODE_TYPE_META } from "../_lib/node-type-meta";
import { WORKFLOW_NODE_TYPE_DRAG_KEY } from "./node-palette";
import type { WorkflowNodeType, Prisma } from "@/generated/prisma/client";

export interface WorkflowCanvasStep {
  id: string;
  nodeType: WorkflowNodeType;
  name: string;
  config: Prisma.JsonValue;
  position: Prisma.JsonValue;
  nextStepId: string | null;
  onTrueStepId: string | null;
  onFalseStepId: string | null;
}

export interface WorkflowCanvasProps {
  workflowId: string;
  steps: WorkflowCanvasStep[];
  selectedStepId?: string | null;
  onNodeSelect?: (step: WorkflowCanvasStep | null) => void;
  /** Gates add-node (drop), connect, and delete — read-only viewers get a plain, uneditable canvas. */
  canManage?: boolean;
  /** Real, latest per-step execution status keyed by step id — see get-latest-step-statuses.ts. Omitted/undefined for a step that renders no status overlay. */
  stepStatuses?: Record<string, NodeRunStatus>;
}

const nodeTypes = { workflowNode: WorkflowCanvasNode };

// var(--primary)/var(--destructive) resolve to real color values (not hsl
// triplets) in this app's tokens.css, and already carry the "true = brand
// green, false = destructive red" meaning used everywhere else in the UI.
const EDGE_COLOR_DEFAULT = "var(--muted-foreground)";
const EDGE_COLOR_TRUE = "var(--primary)";
const EDGE_COLOR_FALSE = "var(--destructive)";

function readPosition(position: Prisma.JsonValue, index: number): { x: number; y: number } {
  if (position && typeof position === "object" && !Array.isArray(position)) {
    const { x, y } = position as { x?: unknown; y?: unknown };
    if (typeof x === "number" && typeof y === "number") return { x, y };
  }
  // Only real steps that have never been dragged/positioned yet land here —
  // a simple vertical stack so a fresh workflow's steps are never stacked
  // invisibly on top of each other at (0, 0).
  return { x: 80, y: index * 150 + 40 };
}

function buildNodes(steps: WorkflowCanvasStep[], stepStatuses?: Record<string, NodeRunStatus>): WorkflowCanvasNodeType[] {
  return steps.map((step, index) => ({
    id: step.id,
    type: "workflowNode",
    position: readPosition(step.position, index),
    data: {
      step: { id: step.id, nodeType: step.nodeType, name: step.name },
      stepStatus: stepStatuses?.[step.id],
    } satisfies WorkflowCanvasNodeData,
  }));
}

function buildEdges(steps: WorkflowCanvasStep[]): Edge[] {
  const edges: Edge[] = [];
  const stepIds = new Set(steps.map((s) => s.id));

  for (const step of steps) {
    if (step.nodeType === "CONDITION") {
      if (step.onTrueStepId && stepIds.has(step.onTrueStepId)) {
        edges.push({
          id: `${step.id}-true-${step.onTrueStepId}`,
          source: step.id,
          sourceHandle: "true",
          target: step.onTrueStepId,
          label: "Yes",
          markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_COLOR_TRUE },
          style: { stroke: EDGE_COLOR_TRUE, strokeWidth: 2 },
          labelStyle: { fill: EDGE_COLOR_TRUE, fontWeight: 600, fontSize: 11 },
        });
      }
      if (step.onFalseStepId && stepIds.has(step.onFalseStepId)) {
        edges.push({
          id: `${step.id}-false-${step.onFalseStepId}`,
          source: step.id,
          sourceHandle: "false",
          target: step.onFalseStepId,
          label: "No",
          markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_COLOR_FALSE },
          style: { stroke: EDGE_COLOR_FALSE, strokeWidth: 2 },
          labelStyle: { fill: EDGE_COLOR_FALSE, fontWeight: 600, fontSize: 11 },
        });
      }
    } else if (step.nextStepId && stepIds.has(step.nextStepId)) {
      edges.push({
        id: `${step.id}-next-${step.nextStepId}`,
        source: step.id,
        target: step.nextStepId,
        markerEnd: { type: MarkerType.ArrowClosed, color: EDGE_COLOR_DEFAULT },
        style: { stroke: EDGE_COLOR_DEFAULT, strokeWidth: 2 },
      });
    }
  }

  return edges;
}

function CanvasInner({ workflowId, steps, selectedStepId, onNodeSelect, canManage = false, stepStatuses }: WorkflowCanvasProps) {
  const router = useRouter();
  const [, startTransition] = React.useTransition();
  const { screenToFlowPosition } = useReactFlow();

  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const stepsById = React.useMemo(() => new Map(steps.map((s) => [s.id, s])), [steps]);

  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowCanvasNodeType>(buildNodes(steps, stepStatuses));
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(buildEdges(steps));

  // Re-sync from the real server-provided steps (e.g. after router.refresh()
  // following a step add/delete/connect elsewhere on this page) — adjusted
  // during render per React's documented pattern rather than a useEffect, to
  // avoid an extra render pass. Position drags are persisted optimistically
  // in local state (see handleNodeDragStop) and are only overwritten once the
  // server round-trip actually lands a new `steps` array. `stepStatuses` is
  // included in the same check since a poll-driven router.refresh() (see
  // run-status-poller.tsx) can land a new stepStatuses object with `steps`
  // itself unchanged.
  const [prevSteps, setPrevSteps] = React.useState(steps);
  const [prevStepStatuses, setPrevStepStatuses] = React.useState(stepStatuses);
  if (steps !== prevSteps || stepStatuses !== prevStepStatuses) {
    setPrevSteps(steps);
    setPrevStepStatuses(stepStatuses);
    setNodes(buildNodes(steps, stepStatuses));
    setEdges(buildEdges(steps));
  }

  const handleNodeDragStop: OnNodeDrag<WorkflowCanvasNodeType> = React.useCallback((_event, node) => {
    void updateWorkflowStepAction(node.id, { position: { x: node.position.x, y: node.position.y } });
  }, []);

  const handleNodeClick: NodeMouseHandler<WorkflowCanvasNodeType> = React.useCallback(
    (_event, node) => {
      onNodeSelect?.(stepsById.get(node.id) ?? null);
    },
    [onNodeSelect, stepsById],
  );

  const handlePaneClick = React.useCallback(() => {
    onNodeSelect?.(null);
  }, [onNodeSelect]);

  // Real xyflow onConnect: fires with { source, target, sourceHandle,
  // targetHandle } when a user drags from one node's handle to another.
  // sourceHandle is "true"/"false" for a CONDITION node's branch handles
  // (see canvas-node.tsx) or null for the plain single source handle every
  // other node type has — that maps directly onto connectWorkflowStepsAction's
  // optional `branch` param.
  const handleConnect: OnConnect = React.useCallback(
    (connection: Connection) => {
      if (!canManage) return;
      const { source, target, sourceHandle } = connection;
      if (!source || !target || source === target) return;
      const branch = sourceHandle === "true" || sourceHandle === "false" ? sourceHandle : undefined;
      startTransition(async () => {
        const result = await connectWorkflowStepsAction(source, target, branch);
        if (!result.ok) {
          toast.error(result.error ?? "Could not connect these steps.");
          return;
        }
        router.refresh();
      });
    },
    [canManage, router, startTransition],
  );

  // Confirms before xyflow applies a Delete/Backspace-triggered removal —
  // returning false here aborts the deletion entirely (nothing disappears
  // from the canvas), so a cancelled confirm never has to be "undone".
  const handleBeforeDelete: OnBeforeDelete<WorkflowCanvasNodeType, Edge> = React.useCallback(
    async ({ nodes: toDelete }) => {
      if (!canManage || toDelete.length === 0) return canManage;
      const label = toDelete.length === 1 ? `"${toDelete[0].data.step.name}"` : `${toDelete.length} steps`;
      return window.confirm(`Delete ${label}? This can't be undone.`);
    },
    [canManage],
  );

  // Only reached once handleBeforeDelete has already confirmed — issues the
  // real deleteWorkflowStepAction call per node.
  const handleNodesDelete: OnNodesDelete<WorkflowCanvasNodeType> = React.useCallback(
    (deleted) => {
      startTransition(async () => {
        const results = await Promise.all(deleted.map((node) => deleteWorkflowStepAction(node.id)));
        const failed = results.find((r) => !r.ok);
        if (failed) toast.error(failed.error ?? "Could not delete one or more steps.");
        router.refresh();
      });
    },
    [router, startTransition],
  );

  // Drop target for node-palette.tsx's draggable items — reads the node type
  // out of the WORKFLOW_NODE_TYPE_DRAG_KEY dataTransfer entry and adds a real
  // step at the exact flow-space point the user dropped on.
  const handleDrop = React.useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!canManage) return;
      const nodeType = event.dataTransfer.getData(WORKFLOW_NODE_TYPE_DRAG_KEY) as WorkflowNodeType | "";
      if (!nodeType) return;
      event.preventDefault();
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      startTransition(async () => {
        const result = await addWorkflowStepAction({
          workflowId,
          nodeType,
          name: NODE_TYPE_META[nodeType].label,
          config: {},
          position,
        });
        if (!result.ok) {
          toast.error(result.error ?? "Could not add step.");
          return;
        }
        router.refresh();
      });
    },
    [canManage, workflowId, screenToFlowPosition, router, startTransition],
  );

  const handleDragOver = React.useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (canManage && event.dataTransfer.types.includes(WORKFLOW_NODE_TYPE_DRAG_KEY)) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }
    },
    [canManage],
  );

  const displayNodes = React.useMemo(
    () => nodes.map((node) => (node.id === selectedStepId ? { ...node, selected: true } : node)),
    [nodes, selectedStepId],
  );

  const colorMode = mounted && resolvedTheme === "light" ? "light" : "dark";

  return (
    <div
      className="glass-panel h-[70vh] min-h-[480px] w-full overflow-hidden rounded-2xl border border-border"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <ReactFlow
        nodes={displayNodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={handleNodeDragStop}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        onConnect={handleConnect}
        onBeforeDelete={handleBeforeDelete}
        onNodesDelete={handleNodesDelete}
        nodesConnectable={canManage}
        nodeTypes={nodeTypes}
        colorMode={colorMode}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeColor="var(--primary)" maskColor="color-mix(in srgb, var(--background) 70%, transparent)" />
      </ReactFlow>
    </div>
  );
}

/**
 * Wraps `CanvasInner` in a `ReactFlowProvider` so it can call `useReactFlow()`
 * for `screenToFlowPosition` (used by the palette drop handler above) — the
 * public `WorkflowCanvas` component/prop contract is unchanged.
 */
export function WorkflowCanvas(props: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
