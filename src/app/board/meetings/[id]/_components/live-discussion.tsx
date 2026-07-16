"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Crown, Megaphone, FileText, Send, TrendingUp, Target, ChevronDown, Lightbulb, DollarSign, Scale, ClipboardList, Bug, Server, PackageCheck } from "lucide-react";

import { cn } from "@/lib/utils";
import { fadeInUp, EASES } from "@/animations";
import { Badge } from "@/components/ui/badge";
import type { AgentType, MeetingMessageType, MessagePriority } from "@/generated/prisma/client";

export interface WarRoomMessage {
  id: string;
  type: MeetingMessageType;
  content: string;
  createdAt: string;
  priority: MessagePriority;
  confidenceScore: number | null;
  suggestedAction: string | null;
  evidence: string | null;
  senderAgent: { id: string; name: string; type: AgentType } | null;
  senderUser: { id: string; name: string | null } | null;
}

const AGENT_ICONS: Partial<Record<AgentType, React.ComponentType<{ className?: string }>>> = {
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

const TYPE_LABEL: Record<MeetingMessageType, string> = {
  DISCUSSION: "Discussion",
  SUGGESTION: "Suggestion",
  VOTE: "Vote",
  DECISION: "Decision",
  ACTION_ITEM: "Action item",
  SUMMARY: "Summary",
};

const PRIORITY_VARIANT: Record<MessagePriority, "default" | "secondary" | "outline" | "accent"> = {
  LOW: "outline",
  NORMAL: "outline",
  HIGH: "accent",
  URGENT: "default",
};

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts.slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}

function BriefingCard({ message }: { message: WarRoomMessage }) {
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const name = message.senderAgent?.name ?? message.senderUser?.name ?? "A team member";
  const Icon = message.senderAgent ? AGENT_ICONS[message.senderAgent.type] ?? Target : null;
  const confidencePct = message.confidenceScore != null ? Math.round(message.confidenceScore) : null;

  return (
    <motion.div
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
      exit={{ opacity: 0 }}
      layout
      className="glass-panel flex flex-col gap-3 rounded-2xl p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
            message.senderAgent ? "bg-primary/10 text-primary" : "bg-muted text-foreground",
          )}
        >
          {Icon ? <Icon className="size-4" /> : initials(name)}
        </span>
        <span className="text-sm font-semibold text-foreground">{name}</span>
        <Badge variant={message.type === "ACTION_ITEM" ? "accent" : "outline"}>{TYPE_LABEL[message.type]}</Badge>
        {message.senderAgent && <Badge variant={PRIORITY_VARIANT[message.priority]}>{message.priority}</Badge>}
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
          {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

      <p className="whitespace-pre-wrap break-words text-sm text-foreground/90">{message.content}</p>

      {message.senderAgent && (confidencePct != null || message.suggestedAction || message.evidence) && (
        <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
            {confidencePct != null && (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                Confidence
                <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${confidencePct}%` }} />
                </span>
                <span className="font-medium text-foreground">{confidencePct}%</span>
              </span>
            )}
            {message.suggestedAction && (
              <span className="flex items-center gap-1.5 text-primary">
                <Lightbulb className="size-3.5" /> {message.suggestedAction}
              </span>
            )}
          </div>
          {message.evidence && (
            <div>
              <button
                type="button"
                onClick={() => setEvidenceOpen((v) => !v)}
                className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <ChevronDown className={cn("size-3.5 transition-transform", evidenceOpen && "rotate-180")} />
                Evidence
              </button>
              <AnimatePresence initial={false}>
                {evidenceOpen && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2, ease: EASES.outQuad }}
                    className="mt-1.5 overflow-hidden text-xs text-muted-foreground"
                  >
                    {message.evidence}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

export function LiveDiscussion({ messages }: { messages: WarRoomMessage[] }) {
  if (messages.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
        No discussion yet — run the first round or post a message to get started.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <AnimatePresence initial={false}>
        {messages.map((message) => (
          <BriefingCard key={message.id} message={message} />
        ))}
      </AnimatePresence>
    </div>
  );
}
