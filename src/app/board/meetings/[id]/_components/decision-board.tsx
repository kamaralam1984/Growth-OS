"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AiErrorBanner } from "@/app/board/_components/ai-error-banner";
import { DECISION_CATEGORY_LABEL } from "@/lib/decision-category";
import { userDecideOverride, type ActionResult } from "../actions";
import { VotingBar, type VoteTally } from "./voting-bar";
import type { DecisionCategory, DecisionStatus } from "@/generated/prisma/client";

export interface WarRoomDecision {
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

function DecisionCard({ decision, canOverride }: { decision: WarRoomDecision; canOverride: boolean }) {
  const router = useRouter();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [activeStatus, setActiveStatus] = useState<"APPROVED" | "REJECTED" | null>(null);

  function override(status: "APPROVED" | "REJECTED") {
    setActiveStatus(status);
    setResult(null);
    startTransition(async () => {
      const res = await userDecideOverride(decision.id, status);
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

      {canOverride && decision.status === "PENDING" && (
        <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Human override</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => override("APPROVED")} disabled={pending}>
              {pending && activeStatus === "APPROVED" ? "Approving…" : "Approve"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => override("REJECTED")} disabled={pending}>
              {pending && activeStatus === "REJECTED" ? "Rejecting…" : "Reject"}
            </Button>
          </div>
          {result && !result.ok && <AiErrorBanner error={result.error ?? "Something went wrong."} />}
        </div>
      )}
    </div>
  );
}

export function DecisionBoard({ decisions, canOverride }: { decisions: WarRoomDecision[]; canOverride: boolean }) {
  if (decisions.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
        No decisions proposed yet — every important call the board makes will appear here.
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
                <DecisionCard key={decision.id} decision={decision} canOverride={canOverride} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
