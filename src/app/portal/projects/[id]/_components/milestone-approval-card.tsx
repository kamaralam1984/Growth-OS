"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star, ThumbsUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { approveMilestone } from "../actions";

export interface PortalMilestone {
  id: string;
  name: string;
  description: string | null;
  dueDate: string | null;
  status: string;
  clientApprovedAt: string | null;
  clientSatisfactionRating: number | null;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "accent"> = {
  PENDING: "outline",
  IN_PROGRESS: "accent",
  COMPLETED: "default",
  DELAYED: "secondary",
};

export function MilestoneApprovalCard({ milestone }: { milestone: PortalMilestone }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rating, setRating] = useState(0);

  function handleApprove() {
    startTransition(async () => {
      await approveMilestone(milestone.id, rating || undefined);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-foreground">{milestone.name}</p>
          {milestone.description && <p className="text-xs text-muted-foreground">{milestone.description}</p>}
          {milestone.dueDate && <p className="text-xs text-muted-foreground">Due {new Date(milestone.dueDate).toLocaleDateString()}</p>}
        </div>
        <Badge variant={STATUS_VARIANT[milestone.status] ?? "outline"}>{milestone.status.replace(/_/g, " ")}</Badge>
      </div>

      {milestone.clientApprovedAt ? (
        <p className="flex items-center gap-1.5 text-xs text-primary">
          <ThumbsUp className="size-3.5" /> You approved this on {new Date(milestone.clientApprovedAt).toLocaleDateString()}
          {milestone.clientSatisfactionRating != null && ` — rated ${milestone.clientSatisfactionRating}/5`}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3 border-t border-border/60 pt-2">
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setRating(n)} aria-label={`Rate ${n}`}>
                <Star className={`size-4 ${n <= rating ? "fill-primary text-primary" : "text-muted-foreground"}`} />
              </button>
            ))}
          </div>
          <Button type="button" size="sm" onClick={handleApprove} disabled={pending}>
            {pending ? "Approving…" : "Approve"}
          </Button>
        </div>
      )}
    </div>
  );
}
