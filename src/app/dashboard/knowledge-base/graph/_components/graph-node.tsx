"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Building2, CheckSquare, FileText, Handshake, Mail, Sparkles, User, UserRound, Users, BookOpen, FolderKanban } from "lucide-react";

import { cn } from "@/lib/utils";
import type { GraphEntityType } from "@/generated/prisma/client";

export interface GraphCanvasNodeData extends Record<string, unknown> {
  entityType: GraphEntityType;
  label: string;
  isCenter: boolean;
}

export type GraphCanvasNodeType = Node<GraphCanvasNodeData, "graphNode">;

/**
 * Visual metadata per GraphEntityType — same "shared meta record" pattern as
 * this app's workflow canvas (see node-type-meta.ts), just scoped to the 7
 * entity types syncOrganizationGraph actually backfills today (DEAL,
 * COMPANY, PROJECT, EMPLOYEE, MEETING, TASK, KNOWLEDGE_ARTICLE) plus CLIENT
 * (used for both real Client rows and Contact rows — see builder.ts) and
 * the three not-yet-backed types (DOCUMENT, EMAIL, AI_DECISION), which still
 * get an icon here in case a node of that type ever exists from elsewhere.
 */
const ENTITY_TYPE_META: Record<GraphEntityType, { label: string; icon: typeof Building2; colorClass: string }> = {
  DEAL: { label: "Deal", icon: Handshake, colorClass: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500" },
  COMPANY: { label: "Company", icon: Building2, colorClass: "border-blue-500/30 bg-blue-500/10 text-blue-500" },
  CLIENT: { label: "Client / Contact", icon: UserRound, colorClass: "border-purple-500/30 bg-purple-500/10 text-purple-500" },
  PROJECT: { label: "Project", icon: FolderKanban, colorClass: "border-amber-500/30 bg-amber-500/10 text-amber-500" },
  EMPLOYEE: { label: "Employee", icon: User, colorClass: "border-cyan-500/30 bg-cyan-500/10 text-cyan-500" },
  MEETING: { label: "Meeting", icon: Users, colorClass: "border-indigo-500/30 bg-indigo-500/10 text-indigo-500" },
  TASK: { label: "Task", icon: CheckSquare, colorClass: "border-rose-500/30 bg-rose-500/10 text-rose-500" },
  DOCUMENT: { label: "Document", icon: FileText, colorClass: "border-border bg-muted/50 text-muted-foreground" },
  EMAIL: { label: "Email", icon: Mail, colorClass: "border-border bg-muted/50 text-muted-foreground" },
  AI_DECISION: { label: "AI Decision", icon: Sparkles, colorClass: "border-border bg-muted/50 text-muted-foreground" },
  KNOWLEDGE_ARTICLE: { label: "Knowledge Article", icon: BookOpen, colorClass: "border-teal-500/30 bg-teal-500/10 text-teal-500" },
};

export function GraphCanvasNode({ data }: NodeProps<GraphCanvasNodeType>) {
  const meta = ENTITY_TYPE_META[data.entityType];
  const Icon = meta.icon;

  return (
    <div
      className={cn(
        "glass-panel relative w-52 rounded-2xl border px-3.5 py-3 shadow-card transition-colors",
        data.isCenter ? "border-primary ring-2 ring-primary/40" : "border-border",
      )}
    >
      <Handle type="target" position={Position.Top} className="!size-2.5 !border-2 !border-background !bg-muted-foreground" />
      <div className="flex items-center gap-2.5">
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg border", meta.colorClass)}>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{data.label}</p>
          <p className="truncate text-[11px] text-muted-foreground">{meta.label}</p>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!size-2.5 !border-2 !border-background !bg-primary" />
    </div>
  );
}

export { ENTITY_TYPE_META };
