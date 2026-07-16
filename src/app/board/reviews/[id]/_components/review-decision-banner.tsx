import { CheckCircle2, AlertTriangle, RotateCcw, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import type { BoardReviewDecision } from "@/generated/prisma/client";

const DECISION_META: Record<BoardReviewDecision, { label: string; icon: typeof CheckCircle2; className: string }> = {
  APPROVED: { label: "Approved", icon: CheckCircle2, className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  APPROVED_WITH_CHANGES: { label: "Approved with Changes", icon: AlertTriangle, className: "border-teal-500/30 bg-teal-500/10 text-teal-600 dark:text-teal-400" },
  NEEDS_REVISION: { label: "Needs Revision", icon: RotateCcw, className: "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400" },
  REJECTED: { label: "Rejected", icon: XCircle, className: "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400" },
};

export function ReviewDecisionBanner({
  decision,
  overallConfidence,
  winProbability,
}: {
  decision: BoardReviewDecision;
  overallConfidence: number | null;
  winProbability: number | null;
}) {
  const meta = DECISION_META[decision];
  const Icon = meta.icon;

  return (
    <div className={cn("flex flex-col gap-2 rounded-2xl border p-5 sm:flex-row sm:items-center sm:justify-between", meta.className)}>
      <div className="flex items-center gap-3">
        <Icon className="size-6 shrink-0" />
        <div>
          <p className="text-lg font-semibold">Board decision: {meta.label}</p>
          <p className="text-xs opacity-80">Final verdict from the AI Proposal Review Board&rsquo;s vote.</p>
        </div>
      </div>
      <div className="flex gap-4 text-sm">
        {overallConfidence != null && (
          <div className="text-right">
            <p className="text-[10px] font-medium uppercase tracking-wider opacity-70">Confidence</p>
            <p className="font-semibold">{Math.round(overallConfidence)}%</p>
          </div>
        )}
        {winProbability != null && (
          <div className="text-right">
            <p className="text-[10px] font-medium uppercase tracking-wider opacity-70">Win probability</p>
            <p className="font-semibold">{Math.round(winProbability)}%</p>
          </div>
        )}
      </div>
    </div>
  );
}
