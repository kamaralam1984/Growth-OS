"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Send, ListChecks, ExternalLink, Eye } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DraftStatusBadge } from "./draft-status-badge";
import { EmailPreviewToggle } from "./email-preview-toggle";
import { requestApproval, decideApproval, queueDraft, sendQueuedDraft, markLinkedInDraftSent } from "../_lib/approval-actions";
import type { EmailDraft } from "@/generated/prisma/client";

export interface DraftCardProps {
  draft: Pick<
    EmailDraft,
    "id" | "channel" | "purpose" | "tone" | "subject" | "body" | "status" | "personalizationNotes" | "openCount" | "clickCount" | "abVariant"
  > & { approvals?: Array<{ id: string; decision: string }> };
  canApprove: boolean;
}

export function DraftCard({ draft, canApprove }: DraftCardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const personalizationNotes = (draft.personalizationNotes as string[] | null) ?? [];
  const pendingApproval = draft.approvals?.find((a) => a.decision === "PENDING");

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setMessage(result.error ?? "Something went wrong.");
      router.refresh();
    });
  }

  return (
    <Card glass>
      <CardContent className="flex flex-col gap-2.5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">{draft.channel}</Badge>
            <Badge variant="outline">{draft.purpose.replace(/_/g, " ")}</Badge>
            <Badge variant="outline">{draft.tone}</Badge>
            {draft.abVariant && <Badge variant="secondary">Variant {draft.abVariant}</Badge>}
          </div>
          <DraftStatusBadge status={draft.status} />
        </div>

        {draft.subject && <p className="text-sm font-medium text-foreground">{draft.subject}</p>}
        {showPreview ? (
          <EmailPreviewToggle subject={draft.subject} body={draft.body} />
        ) : (
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{draft.body}</p>
        )}
        <button
          type="button"
          onClick={() => setShowPreview((v) => !v)}
          className="flex w-fit items-center gap-1 text-xs text-primary hover:underline"
        >
          <Eye className="size-3.5" /> {showPreview ? "Hide preview" : "Desktop / mobile / dark preview"}
        </button>

        {personalizationNotes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {personalizationNotes.map((note, i) => (
              <Badge key={i} variant="accent" className="text-[10px]">
                Personalized: {note}
              </Badge>
            ))}
          </div>
        )}

        {(draft.openCount > 0 || draft.clickCount > 0) && (
          <p className="text-xs text-muted-foreground">
            {draft.openCount} open{draft.openCount === 1 ? "" : "s"} · {draft.clickCount} click{draft.clickCount === 1 ? "" : "s"}
          </p>
        )}

        {message && <p className="text-xs text-destructive">{message}</p>}

        <div className="flex flex-wrap gap-2 border-t border-border pt-2.5">
          {draft.status === "DRAFT" && (
            <Button size="sm" variant="outline" onClick={() => run(() => requestApproval(draft.id))} disabled={pending}>
              <ListChecks className="size-3.5" /> Request approval
            </Button>
          )}
          {draft.status === "PENDING_APPROVAL" && canApprove && pendingApproval && (
            <>
              <Button size="sm" onClick={() => run(() => decideApproval(pendingApproval.id, "APPROVED"))} disabled={pending}>
                <CheckCircle2 className="size-3.5" /> Approve
              </Button>
              <Button size="sm" variant="ghost" onClick={() => run(() => decideApproval(pendingApproval.id, "REJECTED"))} disabled={pending}>
                <XCircle className="size-3.5" /> Reject
              </Button>
            </>
          )}
          {draft.status === "APPROVED" && (
            <Button size="sm" variant="outline" onClick={() => run(() => queueDraft(draft.id))} disabled={pending}>
              <ListChecks className="size-3.5" /> Queue
            </Button>
          )}
          {draft.status === "QUEUED" && draft.channel === "EMAIL" && (
            <Button size="sm" onClick={() => run(() => sendQueuedDraft(draft.id))} disabled={pending}>
              <Send className="size-3.5" /> Send now
            </Button>
          )}
          {draft.status === "QUEUED" && draft.channel === "LINKEDIN" && (
            <Button size="sm" onClick={() => run(() => markLinkedInDraftSent(draft.id))} disabled={pending}>
              <ExternalLink className="size-3.5" /> Mark as sent on LinkedIn
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
