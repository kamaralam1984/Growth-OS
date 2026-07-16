"use client";

import * as React from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { LucideIcon } from "lucide-react";
import {
  Megaphone,
  UserSearch,
  Sparkles,
  Users,
  FileText,
  FolderKanban,
  Gavel,
  Building2,
  CreditCard,
  BarChart3,
  Brain,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Read-only n8n-style diagram of how KVL GrowthOS itself works end to end —
 * documentation for platform admins, not a live/editable Workflow (no
 * relation to the Workflow/WorkflowStep Prisma models at all). Uses the same
 * @xyflow/react canvas the real workflow builder does
 * (src/app/dashboard/automation/workflows/[id]/_components/workflow-canvas.tsx,
 * duplicated for the platform builder at src/app/admin/automation/[id]) for a
 * visually consistent "n8n-style" look, but with every interaction disabled —
 * dragging/connecting/selecting nodes does nothing, and there's nothing to
 * persist.
 */

interface StageData extends Record<string, unknown> {
  label: string;
  description: string;
  icon: LucideIcon;
  href?: string;
}

type StageNode = Node<StageData, "stage">;

interface Stage {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  href?: string;
}

const STAGES: Stage[] = [
  { id: "marketing", label: "Marketing", description: "Public site — pricing, positioning, the free-trial funnel.", icon: Megaphone, href: "/" },
  { id: "lead-capture", label: "Lead Capture", description: "Lead Finder / Client Finder discover and qualify real companies.", icon: UserSearch, href: "/dashboard/lead-finder" },
  { id: "ai-research", label: "AI Research", description: "AI agents research each lead — company intelligence, web search, scoring.", icon: Sparkles, href: "/dashboard/ai-command-center" },
  { id: "crm", label: "CRM", description: "Companies, contacts, deals, and pipeline stages.", icon: Users, href: "/dashboard/crm" },
  { id: "proposal", label: "Proposal", description: "AI-drafted proposals, quotations, and contracts.", icon: FileText, href: "/dashboard/proposal" },
  { id: "project", label: "Project", description: "Won deals become real projects — tasks, timelines, budgets.", icon: FolderKanban, href: "/dashboard/projects" },
  { id: "delivery", label: "Delivery", description: "AI Delivery Board tracks execution against the plan.", icon: Gavel, href: "/dashboard/delivery" },
  { id: "client-portal", label: "Client Portal", description: "The client's own view — progress, files, messages.", icon: Building2, href: "/portal/dashboard" },
  { id: "billing", label: "Billing", description: "Invoices, subscriptions, and payment collection.", icon: CreditCard, href: "/dashboard/billing" },
  { id: "analytics", label: "Analytics", description: "Real metrics roll back up — pipeline health, revenue, agent output.", icon: BarChart3, href: "/dashboard/analytics" },
  { id: "ai-memory", label: "AI Memory", description: "Every stage's outcomes feed back into agent memory for the next cycle.", icon: Brain, href: "/dashboard/ai-command-center/memory" },
];

const NODE_WIDTH = 260;
const NODE_HEIGHT = 92;
const V_GAP = 60;

function buildNodes(): StageNode[] {
  return STAGES.map((stage, index) => ({
    id: stage.id,
    type: "stage",
    // Read-only diagram, never dragged by a user — deliberately not wired to
    // onNodesChange, so this initial layout is also the permanent one.
    position: { x: 0, y: index * (NODE_HEIGHT + V_GAP) },
    data: { label: stage.label, description: stage.description, icon: stage.icon, href: stage.href },
    draggable: false,
    selectable: false,
  }));
}

function buildEdges(): Edge[] {
  const edges: Edge[] = [];
  for (let i = 0; i < STAGES.length - 1; i++) {
    edges.push({
      id: `${STAGES[i].id}-${STAGES[i + 1].id}`,
      source: STAGES[i].id,
      target: STAGES[i + 1].id,
      markerEnd: { type: MarkerType.ArrowClosed, color: "var(--primary)" },
      style: { stroke: "var(--primary)", strokeWidth: 2 },
    });
  }
  // AI Memory feeds back into AI Research — the one real loop in this
  // diagram (every cycle's outcomes inform the next lead's research), drawn
  // as a distinct dashed return edge rather than a third top-to-bottom arrow.
  edges.push({
    id: "ai-memory-ai-research-loop",
    source: "ai-memory",
    target: "ai-research",
    type: "smoothstep",
    label: "feeds back into",
    markerEnd: { type: MarkerType.ArrowClosed, color: "var(--muted-foreground)" },
    style: { stroke: "var(--muted-foreground)", strokeWidth: 1.5, strokeDasharray: "4 4" },
    labelStyle: { fill: "var(--muted-foreground)", fontSize: 10 },
  });
  return edges;
}

function StageNodeCard({ data }: NodeProps<StageNode>) {
  const Icon = data.icon;
  const content = (
    <div
      className={cn(
        "glass-panel relative flex w-64 items-start gap-3 rounded-2xl border border-border px-4 py-3.5 shadow-card transition-colors",
        data.href && "hover:border-primary/50",
      )}
    >
      <Handle type="target" position={Position.Top} className="!size-2 !border-2 !border-background !bg-muted-foreground" isConnectable={false} />
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{data.label}</p>
        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{data.description}</p>
      </div>
      <Handle type="source" position={Position.Bottom} className="!size-2 !border-2 !border-background !bg-primary" isConnectable={false} />
    </div>
  );

  if (!data.href) return content;
  return (
    <Link href={data.href} className="block" title={`Open ${data.label}`}>
      {content}
    </Link>
  );
}

const nodeTypes = { stage: StageNodeCard };

export function PlatformFlowDiagram() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const nodes = React.useMemo(() => buildNodes(), []);
  const edges = React.useMemo(() => buildEdges(), []);
  const colorMode = mounted && resolvedTheme === "light" ? "light" : "dark";

  return (
    <div
      className="glass-panel h-[75vh] min-h-[560px] w-full overflow-hidden rounded-2xl border border-border"
      style={{ ["--xy-node-width" as string]: `${NODE_WIDTH}px` }}
    >
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          colorMode={colorMode}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag
          zoomOnScroll
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
