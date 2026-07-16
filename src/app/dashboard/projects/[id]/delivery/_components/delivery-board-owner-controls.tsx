"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, Pause, Square, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AiErrorBanner, type AIErrorKind } from "@/app/board/_components/ai-error-banner";
import { advanceDeliveryRound, pauseDeliveryMeeting, resumeDeliveryMeeting, postDeliveryMessage, endDeliveryMeeting, type ActionResult } from "../actions";

export interface DeliveryBoardOwnerControlsProps {
  meetingId: string;
  status: "SCHEDULED" | "LIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";
}

/** Owner control bar for the project Delivery Board — modeled directly on War Room's owner-controls.tsx / Review Board's review-owner-controls.tsx, composing the reused pause/resume/ask/end actions with the delivery-specific round action. */
export function DeliveryBoardOwnerControls({ meetingId, status }: DeliveryBoardOwnerControlsProps) {
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
        <Button size="sm" onClick={() => run("round", () => advanceDeliveryRound(meetingId))} disabled={pending || isPaused}>
          {pending && busyAction === "round" ? "Running round…" : status === "SCHEDULED" ? "Start standup" : "Run next round"}
        </Button>
        {isLive ? (
          <Button size="sm" variant="outline" onClick={() => run("pause", () => pauseDeliveryMeeting(meetingId))} disabled={pending}>
            <Pause className="size-4" /> Pause
          </Button>
        ) : (
          status !== "SCHEDULED" && (
            <Button size="sm" variant="outline" onClick={() => run("resume", () => resumeDeliveryMeeting(meetingId))} disabled={pending}>
              <Play className="size-4" /> Resume
            </Button>
          )
        )}
        <Button size="sm" variant="outline" onClick={() => run("end", () => endDeliveryMeeting(meetingId))} disabled={pending}>
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
              const res = await postDeliveryMessage(meetingId, question);
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
