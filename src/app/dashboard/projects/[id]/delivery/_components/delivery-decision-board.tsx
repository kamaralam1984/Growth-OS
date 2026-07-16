"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Gavel } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AiErrorBanner } from "@/app/board/_components/ai-error-banner";
import { DECISION_CATEGORY_LABEL } from "@/lib/decision-category";
import { VotingBar, type VoteTally } from "@/app/board/meetings/[id]/_components/voting-bar";
import { overrideDeliveryDecision, finalizeDeliveryVote, type ActionResult } from "../actions";
import type { DecisionCategory, DecisionStatus } from "@/generated/prisma/client";

export interface DeliveryDecision {
  id: string;
  topic: string;
  description: string | null;
  category: DecisionCategory;
  status: DecisionStatus;
  votes: VoteTally[];
}

const COLUMNS: Array<{ status: DecisionStatus; label: string }> = [
  { status: "PENDING", label: "Pending" },
  { status: "ESCALATED", label: "Escalated" },
  { status: "APPROVED", label: "Approved" },
  { status: "REJECTED", label: "Rejected" },
  { status: "DELAYED", label: "Need More Data" },
  { status: "DELEGATED", label: "Delegated" },
];

const STATUS_VARIANT: Record<DecisionStatus, "default" | "secondary" | "outline" | "accent"> = {
  PENDING: "outline",
  APPROVED: "accent",
  REJECTED: "outline",
  ESCALATED: "secondary",
  DELAYED: "secondary",
  DELEGATED: "secondary",
};

/** Forked from War Room's DecisionBoard — adds a "Run final vote" trigger for PENDING decisions with no votes yet, since proposeDeliveryDecision deliberately doesn't auto-vote (unlike War Room's proposeDecision). Otherwise identical: same columns, same VotingBar, same human override. */
function DeliveryDecisionCard({ decision, canManage }: { decision: DeliveryDecision; canManage: boolean }) {
  const router = useRouter();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [activeAction, setActiveAction] = useState<string | null>(null);

  function run(action: string, fn: () => Promise<ActionResult>) {
    setActiveAction(action);
    setResult(null);
    startTransition(async () => {
      const res = await fn();
      setResult(res);
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="glass-panel flex flex-col gap-3 rounded-2xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">{decision.topic}</p>
        <Badge variant={STATUS_VARIANT[decision.status]}>{decision.status}</Badge>
      </div>
      <Badge variant="outline" className="w-fit">
        {DECISION_CATEGORY_LABEL[decision.category]}
      </Badge>
      {decision.description && <p className="text-xs text-muted-foreground">{decision.description}</p>}

      <VotingBar votes={decision.votes} />

      {decision.votes.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-border/60 pt-2">
          {decision.votes.map((vote, i) => (
            <p key={i} className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{vote.agentName}:</span> {vote.reasoning}
            </p>
          ))}
        </div>
      )}

      {canManage && decision.status === "PENDING" && decision.votes.length === 0 && (
        <Button size="sm" onClick={() => run("vote", () => finalizeDeliveryVote(decision.id))} disabled={pending}>
          <Gavel className="size-4" /> {pending && activeAction === "vote" ? "Voting…" : "Run final vote"}
        </Button>
      )}

      {canManage && decision.status === "PENDING" && decision.votes.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Human override</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => run("APPROVED", () => overrideDeliveryDecision(decision.id, "APPROVED"))} disabled={pending}>
              {pending && activeAction === "APPROVED" ? "Approving…" : "Approve"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => run("REJECTED", () => overrideDeliveryDecision(decision.id, "REJECTED"))} disabled={pending}>
              {pending && activeAction === "REJECTED" ? "Rejecting…" : "Reject"}
            </Button>
          </div>
        </div>
      )}
      {result && !result.ok && <AiErrorBanner error={result.error ?? "Something went wrong."} kind={result.errorKind} />}
    </div>
  );
}

export function DeliveryDecisionBoard({ decisions, canManage }: { decisions: DeliveryDecision[]; canManage: boolean }) {
  if (decisions.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
        No decisions proposed yet — every important delivery call the board makes will appear here.
      </p>
    );
  }

  const nonEmptyColumns = COLUMNS.filter((c) => decisions.some((d) => d.status === c.status));

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {nonEmptyColumns.map((column) => {
        const columnDecisions = decisions.filter((d) => d.status === column.status);
        return (
          <div key={column.status} className="flex w-80 shrink-0 flex-col gap-3">
            <div className="flex items-baseline justify-between px-1">
              <h3 className="text-sm font-semibold text-foreground">{column.label}</h3>
              <span className="text-xs text-muted-foreground">{columnDecisions.length}</span>
            </div>
            <div className="flex flex-col gap-3">
              {columnDecisions.map((decision) => (
                <DeliveryDecisionCard key={decision.id} decision={decision} canManage={canManage} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
