"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Send, Lock, Sparkles, ShieldAlert, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { respondToTicketAction, escalateTicketAction, resolveTicketAction, suggestFaqAnswerAction } from "../../_lib/actions";

interface CommentRow {
  id: string;
  content: string;
  isInternalNote: boolean;
  authorLabel: string;
  createdAt: string;
}

export function TicketThread({ taskId, comments, isResolved }: { taskId: string; comments: CommentRow[]; isResolved: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [content, setContent] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [suggestion, setSuggestion] = useState<{ articleTitle: string | null; suggestedAnswer: string; confidenceScore: number } | null>(null);

  function handleSend() {
    startTransition(async () => {
      const result = await respondToTicketAction(taskId, content, isInternal);
      if (!result.ok) {
        toast.error(result.error ?? "Could not send.");
        return;
      }
      setContent("");
      router.refresh();
    });
  }

  function handleEscalate() {
    startTransition(async () => {
      const result = await escalateTicketAction(taskId);
      if (!result.ok) {
        toast.error(result.error ?? "Could not escalate.");
        return;
      }
      toast.success("Ticket escalated.");
      router.refresh();
    });
  }

  function handleResolve() {
    startTransition(async () => {
      const result = await resolveTicketAction(taskId);
      if (!result.ok) {
        toast.error(result.error ?? "Could not resolve.");
        return;
      }
      toast.success("Ticket resolved.");
      router.refresh();
    });
  }

  function handleSuggest() {
    startTransition(async () => {
      const result = await suggestFaqAnswerAction(taskId);
      if (!result.ok) {
        toast.error(result.error ?? "Could not suggest an answer.");
        return;
      }
      setSuggestion({ articleTitle: result.articleTitle ?? null, suggestedAnswer: result.suggestedAnswer ?? "", confidenceScore: result.confidenceScore ?? 0 });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" onClick={handleSuggest} disabled={pending}>
          <Sparkles className="size-3.5" /> Suggest FAQ answer
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={handleEscalate} disabled={pending}>
          <ShieldAlert className="size-3.5" /> Escalate
        </Button>
        {!isResolved && (
          <Button type="button" size="sm" variant="outline" onClick={handleResolve} disabled={pending}>
            <CheckCircle2 className="size-3.5" /> Resolve
          </Button>
        )}
      </div>

      {suggestion && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
          <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
            <Sparkles className="size-3.5" /> AI-suggested answer {suggestion.articleTitle ? `(from "${suggestion.articleTitle}")` : "(no matching article found)"} — confidence {suggestion.confidenceScore}%
          </p>
          <p className="mt-1 text-foreground">{suggestion.suggestedAnswer}</p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No responses yet.</p>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className={`rounded-lg border p-3 text-sm ${comment.isInternalNote ? "border-amber-500/30 bg-amber-500/5" : "border-border"}`}>
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">{comment.authorLabel}</span>
                <div className="flex items-center gap-2">
                  {comment.isInternalNote && (
                    <Badge variant="outline" className="text-[10px]">
                      <Lock className="mr-1 size-2.5" /> Internal only
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">{new Date(comment.createdAt).toLocaleString()}</span>
                </div>
              </div>
              <p className="mt-1 text-foreground">{comment.content}</p>
            </div>
          ))
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
        <textarea
          placeholder="Write a response..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="min-h-20 rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} />
            Internal note (never visible to the client)
          </label>
          <Button type="button" size="sm" onClick={handleSend} disabled={pending || !content.trim()}>
            <Send className="size-3.5" /> Send
          </Button>
        </div>
      </div>
    </div>
  );
}
