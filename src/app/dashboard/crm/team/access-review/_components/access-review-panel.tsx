"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, ShieldX } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FormField } from "@/components/ui/form-field";
import { toast } from "@/components/ui/toast";
import { startAccessReviewAction, decideAccessReviewEntryAction, completeAccessReviewAction } from "../actions";

export interface AccessReviewFindingRow {
  membershipId: string;
  userId: string;
  userName: string | null;
  email: string | null;
  role: string;
  decision: "CONFIRMED" | "REVOKED" | null;
  decidedAt: string | null;
}

export interface AccessReviewRow {
  id: string;
  periodLabel: string;
  status: "IN_PROGRESS" | "COMPLETED";
  findings: AccessReviewFindingRow[];
  createdAt: string;
  completedAt: string | null;
}

function StartReviewForm() {
  const router = useRouter();
  const [periodLabel, setPeriodLabel] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await startAccessReviewAction({ periodLabel });
      if (!result.ok) {
        toast.error(result.error ?? "Could not start the review.");
        return;
      }
      toast.success("Access review started.");
      setPeriodLabel("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-3">
      <FormField label="Period" htmlFor="review-period" required className="flex-1" hint="e.g. Q1 2026">
        <Input id="review-period" value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} placeholder="Q1 2026" required />
      </FormField>
      <Button type="submit" disabled={pending || periodLabel.trim().length === 0} size="sm">
        {pending ? "Starting…" : "Start review"}
      </Button>
    </form>
  );
}

function ReviewEntryRow({ reviewId, entry, completed }: { reviewId: string; entry: AccessReviewFindingRow; completed: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function decide(decision: "CONFIRMED" | "REVOKED") {
    startTransition(async () => {
      const result = await decideAccessReviewEntryAction({ reviewId, membershipId: entry.membershipId, decision });
      if (!result.ok) {
        toast.error(result.error ?? "Could not record the decision.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 p-3">
      <div>
        <p className="text-sm font-medium text-foreground">{entry.userName || entry.email || entry.userId}</p>
        <p className="text-xs text-muted-foreground">
          {entry.email} · {entry.role}
        </p>
      </div>
      {entry.decision ? (
        <Badge variant={entry.decision === "CONFIRMED" ? "accent" : "secondary"}>{entry.decision}</Badge>
      ) : completed ? (
        <Badge variant="outline">No decision recorded</Badge>
      ) : (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => decide("CONFIRMED")} disabled={pending}>
            <ShieldCheck className="size-3.5" /> Confirm access
          </Button>
          <Button variant="outline" size="sm" onClick={() => decide("REVOKED")} disabled={pending} className="text-red-500 hover:bg-red-500/10">
            <ShieldX className="size-3.5" /> Revoke
          </Button>
        </div>
      )}
    </div>
  );
}

function CompleteReviewButton({ reviewId }: { reviewId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleComplete() {
    startTransition(async () => {
      const result = await completeAccessReviewAction({ reviewId });
      if (!result.ok) {
        toast.error(result.error ?? "Could not complete the review.");
        return;
      }
      toast.success("Access review completed.");
      router.refresh();
    });
  }

  return (
    <Button size="sm" onClick={handleComplete} disabled={pending}>
      {pending ? "Completing…" : "Complete review"}
    </Button>
  );
}

export function AccessReviewPanel({ reviews }: { reviews: AccessReviewRow[] }) {
  const inProgress = reviews.find((r) => r.status === "IN_PROGRESS");
  const past = reviews.filter((r) => r.status !== "IN_PROGRESS");

  return (
    <div className="flex flex-col gap-4">
      {!inProgress && (
        <Card glass>
          <CardHeader>
            <CardTitle>Start a new access review</CardTitle>
            <CardDescription>Snapshots every active member&apos;s role right now for your team to confirm or revoke.</CardDescription>
          </CardHeader>
          <CardContent>
            <StartReviewForm />
          </CardContent>
        </Card>
      )}

      {inProgress && (
        <Card glass>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Access review — {inProgress.periodLabel}</CardTitle>
                <CardDescription>
                  {inProgress.findings.filter((f) => f.decision).length} / {inProgress.findings.length} decided
                </CardDescription>
              </div>
              <CompleteReviewButton reviewId={inProgress.id} />
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {inProgress.findings.map((entry) => (
              <ReviewEntryRow key={entry.membershipId} reviewId={inProgress.id} entry={entry} completed={false} />
            ))}
          </CardContent>
        </Card>
      )}

      {past.length > 0 && (
        <Card glass>
          <CardHeader>
            <CardTitle>Past reviews</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {past.map((review) => (
              <div key={review.id} className="flex flex-col gap-2 border-b border-border/60 pb-4 last:border-b-0 last:pb-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">{review.periodLabel}</p>
                  <p className="text-xs text-muted-foreground">Completed {review.completedAt ? new Date(review.completedAt).toLocaleDateString() : "—"}</p>
                </div>
                <div className="flex flex-col gap-1.5">
                  {review.findings.map((entry) => (
                    <ReviewEntryRow key={entry.membershipId} reviewId={review.id} entry={entry} completed />
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
