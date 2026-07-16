"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Crown, Megaphone, FileText, TrendingUp, Database, BarChart3, DollarSign, Scale, Target, ThumbsUp, ThumbsDown, Lightbulb, Percent, PieChart } from "lucide-react";

import { cn } from "@/lib/utils";
import { fadeInUp } from "@/animations";
import { Badge } from "@/components/ui/badge";
import type { AgentType } from "@/generated/prisma/client";

export interface ReviewFinding {
  id: string;
  createdAt: string;
  confidenceScore: number | null;
  senderAgent: { id: string; name: string; type: AgentType } | null;
  opinion: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: Array<{ type: string; title: string; description: string }>;
  winProbability: number | null;
  profitMarginEstimate: number | null;
}

const AGENT_ICONS: Partial<Record<AgentType, React.ComponentType<{ className?: string }>>> = {
  CEO: Crown,
  SALES: TrendingUp,
  MARKETING: Megaphone,
  PROPOSAL: FileText,
  CRM: Database,
  ANALYTICS: BarChart3,
  FINANCE: DollarSign,
  LEGAL: Scale,
};

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts.slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}

/** One board member's real, structured review contribution — the Review Room's equivalent of the War Room's BriefingCard, richer by design (strengths/weaknesses/recommendations/win probability/profit margin instead of just a suggested action). */
export function ReviewFindingCard({ finding }: { finding: ReviewFinding }) {
  const name = finding.senderAgent?.name ?? "A team member";
  const Icon = finding.senderAgent ? (AGENT_ICONS[finding.senderAgent.type] ?? Target) : null;
  const confidencePct = finding.confidenceScore != null ? Math.round(finding.confidenceScore) : null;

  return (
    <motion.div variants={fadeInUp} initial="hidden" animate="visible" exit={{ opacity: 0 }} layout className="glass-panel flex flex-col gap-3 rounded-2xl p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold", finding.senderAgent ? "bg-primary/10 text-primary" : "bg-muted text-foreground")}>
          {Icon ? <Icon className="size-4" /> : initials(name)}
        </span>
        <span className="text-sm font-semibold text-foreground">{name}</span>
        {confidencePct != null && <Badge variant="outline">{confidencePct}% confident</Badge>}
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
          {new Date(finding.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

      <p className="whitespace-pre-wrap break-words text-sm text-foreground/90">{finding.opinion}</p>

      {(finding.strengths.length > 0 || finding.weaknesses.length > 0) && (
        <div className="grid grid-cols-1 gap-3 border-t border-border/60 pt-3 sm:grid-cols-2">
          {finding.strengths.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                <ThumbsUp className="size-3.5" /> Strengths
              </span>
              <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                {finding.strengths.map((s, i) => (
                  <li key={i}>• {s}</li>
                ))}
              </ul>
            </div>
          )}
          {finding.weaknesses.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-rose-600 dark:text-rose-400">
                <ThumbsDown className="size-3.5" /> Weaknesses
              </span>
              <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                {finding.weaknesses.map((w, i) => (
                  <li key={i}>• {w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {finding.recommendations.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-border/60 pt-3">
          <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-primary">
            <Lightbulb className="size-3.5" /> Recommendations
          </span>
          <ul className="flex flex-col gap-1.5">
            {finding.recommendations.map((r, i) => (
              <li key={i} className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{r.title}:</span> {r.description}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(finding.winProbability != null || finding.profitMarginEstimate != null) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border/60 pt-3 text-xs">
          {finding.winProbability != null && (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Percent className="size-3.5" /> Win probability <span className="font-medium text-foreground">{Math.round(finding.winProbability)}%</span>
            </span>
          )}
          {finding.profitMarginEstimate != null && (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <PieChart className="size-3.5" /> Est. profit margin <span className="font-medium text-foreground">{Math.round(finding.profitMarginEstimate)}%</span>
            </span>
          )}
        </div>
      )}
    </motion.div>
  );
}

export function ReviewDiscussion({ findings }: { findings: ReviewFinding[] }) {
  if (findings.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
        No review findings yet — run the first round to hear from the board.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <AnimatePresence initial={false}>
        {findings.map((finding) => (
          <ReviewFindingCard key={finding.id} finding={finding} />
        ))}
      </AnimatePresence>
    </div>
  );
}
