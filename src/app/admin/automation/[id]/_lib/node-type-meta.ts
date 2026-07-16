import {
  Zap,
  GitBranch,
  Clock,
  Repeat,
  Sparkles,
  Mail,
  MessageSquare,
  Webhook,
  Users,
  FileText,
  FolderKanban,
  CheckSquare,
  File,
  Bell,
  Database,
  FunctionSquare,
  Globe,
  type LucideIcon,
} from "lucide-react";
import type { WorkflowNodeType } from "@/generated/prisma/client";

/**
 * Shared visual metadata for every WorkflowNodeType — the single source of
 * truth the canvas (custom node components), the add-node palette, and the
 * property editor panel all read from, so a node always looks/labels
 * consistently everywhere in the builder.
 */
export interface NodeTypeMeta {
  label: string;
  icon: LucideIcon;
  /** Tailwind color token family, matching this repo's existing badge/accent conventions (emerald/blue/purple/amber/rose semantic ramps). */
  color: "emerald" | "blue" | "purple" | "amber" | "rose" | "neutral";
  description: string;
}

export const NODE_TYPE_META: Record<WorkflowNodeType, NodeTypeMeta> = {
  TRIGGER: { label: "Trigger", icon: Zap, color: "emerald", description: "Starts the workflow when a real event fires." },
  CONDITION: { label: "Condition", icon: GitBranch, color: "amber", description: "Branches true/false on a real field comparison." },
  DELAY: { label: "Delay", icon: Clock, color: "neutral", description: "Suspends the run for a real duration or until a date." },
  LOOP: { label: "Loop", icon: Repeat, color: "neutral", description: "Repeats one action over a real array of items." },
  AI_ACTION: { label: "AI Action", icon: Sparkles, color: "purple", description: "A real Claude call, optionally as a named executive persona." },
  EMAIL: { label: "Email", icon: Mail, color: "blue", description: "Sends a real email via a connected mailbox or Resend/SMTP." },
  SMS: { label: "SMS", icon: MessageSquare, color: "rose", description: "Sends a real text message via a connected Twilio account." },
  WEBHOOK: { label: "Webhook", icon: Webhook, color: "blue", description: "Makes a real outgoing HTTP call." },
  CRM: { label: "CRM", icon: Users, color: "emerald", description: "Creates/updates a real Deal or Contact." },
  PROPOSAL: { label: "Proposal", icon: FileText, color: "purple", description: "Generates a real AI-drafted proposal." },
  PROJECT: { label: "Project", icon: FolderKanban, color: "emerald", description: "Creates a real Project, optionally from a won Deal." },
  APPROVAL: { label: "Approval", icon: CheckSquare, color: "amber", description: "Checks this org's real approval policy." },
  DOCUMENT: { label: "Document", icon: File, color: "blue", description: "Renders a real document to PDF or DOCX." },
  NOTIFICATION: { label: "Notification", icon: Bell, color: "rose", description: "Sends a real in-app notification." },
  DATABASE: { label: "Database", icon: Database, color: "neutral", description: "Real read-only query over a whitelisted model." },
  FUNCTION: { label: "Function", icon: FunctionSquare, color: "neutral", description: "Calls a real, whitelisted internal function." },
  CUSTOM_API: { label: "Custom API", icon: Globe, color: "blue", description: "Real outgoing HTTP call, optionally with a stored secret." },
};

export const ALL_NODE_TYPES = Object.keys(NODE_TYPE_META) as WorkflowNodeType[];
