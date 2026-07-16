"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, ShieldAlert, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { requestBoardReviewAndOpen } from "@/app/board/reviews/_lib/review-actions";
import { submitApprovalOverride } from "@/app/board/reviews/_lib/review-actions";
import type { DocumentKind } from "@/generated/prisma/client";

export interface BoardReviewPanelProps {
  docKind: DocumentKind;
  docId: string;
  latestReviewId: string | null;
  finalDecision: string | null;
  meetingStatus: "SCHEDULED" | "LIVE" | "PAUSED" | "COMPLETED" | "CANCELLED" | null;
  overallConfidence: number | null;
  winProbability: number | null;
  gateAllowed: boolean;
  gateReason: string | null;
  policyMode: "ADVISORY" | "APPROVAL_REQUIRED";
  canManage: boolean;
}

const DECISION_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "accent" }> = {
  APPROVED: { label: "Approved", variant: "accent" },
  APPROVED_WITH_CHANGES: { label: "Approved with Changes", variant: "accent" },
  NEEDS_REVISION: { label: "Needs Revision", variant: "secondary" },
  REJECTED: { label: "Rejected", variant: "outline" },
};

/** Shown on every Proposal/Quotation/Contract/Invoice detail page — reflects the AI Proposal Review Board's real status for this document, and (when the org's approval policy blocks sending) lets an owner/admin override with a required reason. */
export function BoardReviewPanel(props: BoardReviewPanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [reason, setReason] = useState("");

  function handleRequestReview() {
    setError(null);
    startTransition(async () => {
      const result = await requestBoardReviewAndOpen(props.docKind, props.docId);
      if (result && !result.ok) setError(result.error ?? "Something went wrong.");
    });
  }

  function handleOverride() {
    if (!props.latestReviewId) return;
    setError(null);
    startTransition(async () => {
      const result = await submitApprovalOverride(props.latestReviewId!, reason);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setOverrideOpen(false);
      setReason("");
      router.refresh();
    });
  }

  const decisionMeta = props.finalDecision ? DECISION_LABEL[props.finalDecision] : null;

  return (
    <Card glass>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-4" /> AI Board Review
        </CardTitle>
        <CardDescription>
          {props.policyMode === "APPROVAL_REQUIRED" ? "This organization requires Board approval before sending." : "Informational — sending is never blocked in Advisory mode."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {decisionMeta ? (
            <Badge variant={decisionMeta.variant}>{decisionMeta.label}</Badge>
          ) : props.latestReviewId ? (
            <Badge variant="outline">{props.meetingStatus === "LIVE" ? "Review in progress" : "Review scheduled"}</Badge>
          ) : (
            <Badge variant="outline">Not yet reviewed</Badge>
          )}
          {props.overallConfidence != null && <span className="text-xs text-muted-foreground">{Math.round(props.overallConfidence)}% confidence</span>}
          {props.winProbability != null && <span className="text-xs text-muted-foreground">{Math.round(props.winProbability)}% win probability</span>}
        </div>

        <div className="flex flex-wrap gap-2">
          {props.latestReviewId ? (
            <Link href={`/board/reviews/${props.latestReviewId}`} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              View Board Review <ArrowRight className="size-3.5" />
            </Link>
          ) : null}
          {props.canManage && (
            <Button type="button" size="sm" variant="outline" onClick={handleRequestReview} disabled={pending}>
              {pending ? "Requesting…" : props.latestReviewId ? "Request another review" : "Submit for Board Review"}
            </Button>
          )}
        </div>

        {!props.gateAllowed && (
          <div className="flex flex-col gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <span className="flex items-start gap-2">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" /> {props.gateReason}
            </span>
            {props.canManage && props.latestReviewId && (
              <div>
                {!overrideOpen ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => setOverrideOpen(true)}>
                    Override as owner
                  </Button>
                ) : (
                  <div className="flex flex-col gap-2">
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={2}
                      placeholder="Reason for overriding the Board's review (required, recorded in the audit log)…"
                      className="w-full resize-none rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <div className="flex gap-2">
                      <Button type="button" size="sm" onClick={handleOverride} disabled={pending || !reason.trim()}>
                        {pending ? "Recording…" : "Confirm override"}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setOverrideOpen(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
