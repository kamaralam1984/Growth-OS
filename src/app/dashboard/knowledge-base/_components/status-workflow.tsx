"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, RotateCcw, Send, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { setArticleStatus } from "../actions";

export interface StatusWorkflowProps {
  articleId: string;
  status: string;
  canManage: boolean;
  canPublish: boolean;
  reviewedByName?: string | null;
  reviewedAt?: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PENDING_REVIEW: "Pending review",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "accent"> = {
  DRAFT: "outline",
  PENDING_REVIEW: "accent",
  PUBLISHED: "default",
  ARCHIVED: "secondary",
};

/** Real DRAFT -> PENDING_REVIEW -> PUBLISHED -> ARCHIVED publish workflow controls, matching the transitions enforced server-side in setArticleStatus. */
export function StatusWorkflow({ articleId, status, canManage, canPublish, reviewedByName, reviewedAt }: StatusWorkflowProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function transition(next: "DRAFT" | "PENDING_REVIEW" | "PUBLISHED" | "ARCHIVED") {
    startTransition(async () => {
      const result = await setArticleStatus(articleId, next);
      if (!result.ok) {
        toast.error(result.error ?? "Something went wrong.");
        return;
      }
      toast.success(`Status changed to ${STATUS_LABEL[next]}.`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Badge variant={STATUS_VARIANT[status] ?? "outline"}>{STATUS_LABEL[status] ?? status}</Badge>
      {status === "PUBLISHED" && reviewedByName && (
        <span className="text-xs text-muted-foreground">
          Reviewed by {reviewedByName}
          {reviewedAt ? ` on ${new Date(reviewedAt).toLocaleDateString()}` : ""}
        </span>
      )}

      {canManage && (
        <div className="flex flex-wrap gap-2">
          {status === "DRAFT" && (
            <Button size="sm" variant="secondary" onClick={() => transition("PENDING_REVIEW")} disabled={pending}>
              <Send className="size-4" /> Submit for review
            </Button>
          )}
          {status === "PENDING_REVIEW" && (
            <Button size="sm" variant="secondary" onClick={() => transition("DRAFT")} disabled={pending}>
              <RotateCcw className="size-4" /> Withdraw to draft
            </Button>
          )}
          {status === "PENDING_REVIEW" && canPublish && (
            <Button size="sm" onClick={() => transition("PUBLISHED")} disabled={pending}>
              <CheckCircle2 className="size-4" /> Publish
            </Button>
          )}
          {status === "PUBLISHED" && (
            <Button size="sm" variant="ghost" onClick={() => transition("ARCHIVED")} disabled={pending}>
              <Archive className="size-4" /> Archive
            </Button>
          )}
          {status === "DRAFT" && (
            <Button size="sm" variant="ghost" onClick={() => transition("ARCHIVED")} disabled={pending}>
              <Archive className="size-4" /> Archive
            </Button>
          )}
          {status === "ARCHIVED" && (
            <Button size="sm" variant="secondary" onClick={() => transition("DRAFT")} disabled={pending}>
              <RotateCcw className="size-4" /> Restore to draft
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
