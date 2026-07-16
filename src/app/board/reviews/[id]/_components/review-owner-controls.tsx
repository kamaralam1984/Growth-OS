"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, Pause, Square, Send, Gavel } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AiErrorBanner, type AIErrorKind } from "@/app/board/_components/ai-error-banner";
import {
  advanceReviewRound,
  finalizeReviewVote,
  pauseReviewMeeting,
  resumeReviewMeeting,
  postReviewMessage,
  endReviewMeeting,
  type ActionResult,
} from "../../_lib/review-actions";

export interface ReviewOwnerControlsProps {
  boardReviewId: string;
  meetingId: string;
  status: "SCHEDULED" | "LIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";
  hasFinalDecision: boolean;
}

/** Owner control bar for the Review Room — Run review round / Pause / Resume / Ask a question / Run final vote / End & Summarize. Modeled directly on the War Room's owner-controls.tsx, composing the reused pause/resume/ask/end actions with the two genuinely new review-specific ones. */
export function ReviewOwnerControls({ boardReviewId, meetingId, status, hasFinalDecision }: ReviewOwnerControlsProps) {
  const router = useRouter();
  const [askOpen, setAskOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [pending, startTransition] = useTransition();
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);

  const isLive = status === "LIVE";
  const isPaused = status === "PAUSED";
  const isActive = isLive || isPaused || status === "SCHEDULED";

  function run(action: string, fn: () => Promise<ActionResult>) {
    setBusyAction(action);
    setResult(null);
    startTransition(async () => {
      const res = await fn();
      setResult(res);
      if (res.ok) router.refresh();
    });
  }

  if (!isActive) return null;

  return (
    <div className="glass-panel-strong flex flex-col gap-3 rounded-2xl p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => run("round", () => advanceReviewRound(boardReviewId))} disabled={pending || isPaused}>
          {pending && busyAction === "round" ? "Running round…" : "Run review round"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => run("vote", () => finalizeReviewVote(boardReviewId))}
          disabled={pending || isPaused || hasFinalDecision}
        >
          <Gavel className="size-4" /> {pending && busyAction === "vote" ? "Voting…" : hasFinalDecision ? "Vote finalized" : "Run final vote"}
        </Button>
        {isLive ? (
          <Button size="sm" variant="outline" onClick={() => run("pause", () => pauseReviewMeeting(meetingId))} disabled={pending}>
            <Pause className="size-4" /> Pause
          </Button>
        ) : (
          status !== "SCHEDULED" && (
            <Button size="sm" variant="outline" onClick={() => run("resume", () => resumeReviewMeeting(meetingId))} disabled={pending}>
              <Play className="size-4" /> Resume
            </Button>
          )
        )}
        <Button size="sm" variant="outline" onClick={() => run("end", () => endReviewMeeting(meetingId))} disabled={pending}>
          <Square className="size-4" /> End &amp; Summarize
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setAskOpen((v) => !v)} disabled={isPaused || status === "SCHEDULED"}>
          <Send className="size-4" /> Ask a question
        </Button>
      </div>

      {result && !result.ok && <AiErrorBanner error={result.error ?? "Something went wrong."} kind={result.errorKind as AIErrorKind} />}

      {askOpen && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run("ask", async () => {
              const res = await postReviewMessage(meetingId, question);
              if (res.ok) setQuestion("");
              return res;
            });
          }}
          className="flex gap-2 rounded-xl border border-border/60 p-3"
        >
          <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask the board a question or add a comment…" maxLength={4000} />
          <Button type="submit" size="sm" disabled={pending || !question.trim()}>
            {pending && busyAction === "ask" ? "Posting…" : "Post"}
          </Button>
        </form>
      )}
    </div>
  );
}
