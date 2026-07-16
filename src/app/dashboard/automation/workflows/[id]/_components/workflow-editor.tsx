"use client";

import * as React from "react";
import { LayoutList, Waypoints } from "lucide-react";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { StepList, type StepDisplay } from "./step-list";
import { StepForm } from "./step-form";
import { WorkflowCanvas, type WorkflowCanvasStep } from "./workflow-canvas";
import { NodePalette } from "./node-palette";
import { NodePropertyPanel, type WorkflowStepPanelData } from "./node-property-panel";
import { RunStatusPoller } from "./run-status-poller";
import type { NodeRunStatus } from "./node-status-badge";

export interface WorkflowEditorProps {
  workflowId: string;
  steps: WorkflowCanvasStep[];
  canManage: boolean;
  /** Real, latest per-step execution status keyed by step id — see get-latest-step-statuses.ts. The run-now button itself is mounted at the page level (page.tsx), alongside "View run history", not inside this tab shell. */
  stepStatuses?: Record<string, NodeRunStatus>;
}

/**
 * The workflow detail page's client-side "app shell" — owns the List/Canvas
 * view toggle and, in Canvas mode, composes the real canvas with the
 * property panel / node palette / run-now button built alongside this piece.
 * List mode keeps the original plain StepList + StepForm editor working
 * exactly as it did before the canvas existed, as a real fallback.
 */
export function WorkflowEditor({ workflowId, steps, canManage, stepStatuses }: WorkflowEditorProps) {
  const [selectedStep, setSelectedStep] = React.useState<WorkflowCanvasStep | null>(null);

  const listSteps: StepDisplay[] = steps.map((s) => ({
    id: s.id,
    nodeType: s.nodeType,
    name: s.name,
    config: s.config,
    nextStepId: s.nextStepId,
    onTrueStepId: s.onTrueStepId,
    onFalseStepId: s.onFalseStepId,
  }));

  const panelStep: WorkflowStepPanelData | null = selectedStep
    ? { id: selectedStep.id, nodeType: selectedStep.nodeType, name: selectedStep.name, config: selectedStep.config }
    : null;

  return (
    <Tabs defaultValue="canvas" className="gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">Steps</h2>
        <TabsList>
          <TabsTrigger value="canvas">
            <Waypoints className="size-3.5" /> Canvas
          </TabsTrigger>
          <TabsTrigger value="list">
            <LayoutList className="size-3.5" /> List
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="canvas" className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Drag nodes to arrange the flow — positions save automatically. Click a node to edit it, or connect two
          nodes by dragging from one handle to another.
          {canManage && " Drag a node type from the palette (or click it) to add a step."}
        </p>
        <div className="flex gap-3">
          {canManage && <NodePalette workflowId={workflowId} stepCount={steps.length} />}
          <div className="min-w-0 flex-1">
            <WorkflowCanvas
              workflowId={workflowId}
              steps={steps}
              selectedStepId={selectedStep?.id ?? null}
              onNodeSelect={setSelectedStep}
              canManage={canManage}
              stepStatuses={stepStatuses}
            />
          </div>
        </div>
        <RunStatusPoller stepStatuses={stepStatuses ?? {}} />
        {canManage && <NodePropertyPanel step={panelStep} onClose={() => setSelectedStep(null)} />}
      </TabsContent>

      <TabsContent value="list" className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          A plain, non-visual step list. Each step&apos;s Next / On true / On false fields point to another
          step&apos;s id, forming the execution DAG.
        </p>
        <StepList steps={listSteps} canManage={canManage} />
        {canManage && <StepForm workflowId={workflowId} />}
      </TabsContent>
    </Tabs>
  );
}
