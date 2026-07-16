"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Crown, Megaphone, FileText, Send, TrendingUp, Target, BrainCircuit, DollarSign, Scale, ClipboardList, Bug, Server, PackageCheck } from "lucide-react";

import { glowPulse, EASES } from "@/animations";
import { VoiceWave } from "@/app/board/reviews/[id]/_components/voice-wave";
import type { AgentStatus, AgentType } from "@/generated/prisma/client";

export interface WarRoomAgentSeat {
  id: string;
  type: AgentType;
  name: string;
  status: AgentStatus;
  currentTask: string | null;
  confidenceScore: number | null;
  memoryCount: number;
  memoryUpdatedAt: string | null;
}

const AGENT_ICONS: Partial<Record<AgentType, React.ComponentType<{ className?: string; strokeWidth?: number }>>> = {
  CEO: Crown,
  SALES: TrendingUp,
  MARKETING: Megaphone,
  PROPOSAL: FileText,
  OUTREACH: Send,
  FINANCE: DollarSign,
  LEGAL: Scale,
  PROJECT_MANAGER: ClipboardList,
  QA_DIRECTOR: Bug,
  DEVOPS_DIRECTOR: Server,
  DELIVERY_DIRECTOR: PackageCheck,
};

const BUSY_STATUSES = new Set<AgentStatus>(["THINKING", "RESEARCHING", "PLANNING", "ANALYZING"]);

/**
 * Thinking-state vocabulary the spec asks for verbatim (Thinking.../
 * Searching.../Planning.../Reasoning.../Waiting.../Completed) mapped onto
 * the real AgentStatus enum — RESEARCHING reads as "Searching" and ANALYZING
 * as "Reasoning" in boardroom language; IDLE (not in the spec's list, since
 * it only enumerates active/finished states) gets an honest "Idle" label
 * rather than being hidden.
 */
const STATUS_LABEL: Record<AgentStatus, string> = {
  IDLE: "Idle",
  THINKING: "Thinking…",
  RESEARCHING: "Searching…",
  PLANNING: "Planning…",
  ANALYZING: "Reasoning…",
  WAITING: "Waiting…",
  COMPLETED: "Completed",
};

function formatMemoryAge(iso: string | null): string {
  if (!iso) return "No memory yet";
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "Updated just now";
  if (minutes < 60) return `Updated ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Updated ${hours}h ago`;
  return `Updated ${Math.round(hours / 24)}d ago`;
}

/** `showVoiceWave` is opt-in (default off) so the War Room's existing seats render exactly as before — only the AI Proposal Review Board's room passes it. */
export function AgentSeat({ agent, showVoiceWave = false }: { agent: WarRoomAgentSeat; showVoiceWave?: boolean }) {
  const Icon = AGENT_ICONS[agent.type] ?? Target;
  const isBusy = BUSY_STATUSES.has(agent.status);
  const confidencePct =
    agent.confidenceScore !== null ? Math.max(0, Math.min(100, Math.round(agent.confidenceScore))) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASES.outExpo }}
      className="glass-panel-strong relative flex w-56 shrink-0 flex-col gap-3 rounded-2xl p-4"
      style={isBusy ? { boxShadow: "var(--shadow-glow-primary)" } : undefined}
    >
      <div className="flex items-center gap-3">
        <span className="relative flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5.5" strokeWidth={2} />
          {isBusy && (
            <motion.span
              animate={glowPulse.animate}
              className="absolute -right-1 -top-1 size-2.5 rounded-full bg-primary shadow-glow-primary"
            />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold tracking-tight text-foreground">{agent.name}</p>
          <div className="flex items-center gap-1.5">
            <p className="text-xs text-muted-foreground">{STATUS_LABEL[agent.status]}</p>
            {showVoiceWave && <VoiceWave active={isBusy} />}
          </div>
        </div>
      </div>

      <p className="line-clamp-2 min-h-[2.25rem] text-xs text-muted-foreground">
        {agent.currentTask || "No active task"}
      </p>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-medium uppercase tracking-wider text-muted-foreground">Confidence</span>
          <span className="text-foreground">{confidencePct !== null ? `${confidencePct}%` : "—"}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          {confidencePct !== null && (
            <motion.div
              className="h-full rounded-full bg-primary"
              initial={{ width: 0 }}
              animate={{ width: `${confidencePct}%` }}
              transition={{ duration: 0.8, ease: EASES.outExpo }}
            />
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
        <BrainCircuit className="size-3.5 shrink-0" />
        <span className="truncate">
          {agent.memoryCount} {agent.memoryCount === 1 ? "memory" : "memories"} · {formatMemoryAge(agent.memoryUpdatedAt)}
        </span>
      </div>
    </motion.div>
  );
}
