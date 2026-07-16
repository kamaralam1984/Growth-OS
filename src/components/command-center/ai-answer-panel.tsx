"use client";

import { Sparkles } from "lucide-react";
import { motion } from "framer-motion";

import { glowPulse } from "@/animations";
import { AiErrorBanner, type AIErrorKind } from "@/app/board/_components/ai-error-banner";

export type AIAnswerState =
  | { status: "loading" }
  | { status: "result"; content: string }
  | { status: "error"; message: string; kind: AIErrorKind };

/**
 * Shared render for the outcome of a runAICommandBar call — used by both
 * the Command Palette's "Ask AI" result panel and the standalone AI
 * Command Bar, so the loading / honest-error / real-result states only
 * exist in one place.
 */
export function AIAnswerPanel({ state, commandText }: { state: AIAnswerState; commandText: string }) {
  if (state.status === "loading") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-accent/30 p-4 text-sm text-muted-foreground">
        <motion.span
          animate={glowPulse.animate}
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
        >
          <Sparkles className="size-4" />
        </motion.span>
        <span className="truncate">Thinking about &ldquo;{commandText}&rdquo;…</span>
      </div>
    );
  }

  if (state.status === "error") {
    return <AiErrorBanner error={state.message} kind={state.kind} />;
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-primary">
        <Sparkles className="size-3.5" />
        AI response
      </p>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{state.content}</p>
    </div>
  );
}
