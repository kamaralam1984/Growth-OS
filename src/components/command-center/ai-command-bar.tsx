"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Sparkles, ArrowRight, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { glowPulse } from "@/animations";
import { Button } from "@/components/ui/button";
import { getNavigationCommands, type CommandDefinition } from "@/lib/nav-commands";

import { runAICommandBar } from "./actions";
import { AIAnswerPanel, type AIAnswerState } from "./ai-answer-panel";

const NAV_COMMANDS = getNavigationCommands();

const PLACEHOLDER_EXAMPLES = [
  "Find hospitals in Dubai",
  "Generate proposal",
  "Show today's meetings",
  "Find manufacturing leads",
  "Analyze company website",
  "Prepare CRM report",
  "Create LinkedIn campaign",
  "Summarize today's work",
] as const;

const NAV_TRIGGER_PREFIXES = ["go to ", "open ", "show ", "navigate to ", "take me to ", "jump to "] as const;

/**
 * Deterministic, free (no AI call) routing for commands that are really
 * just navigation in disguise — a bare "Dashboard"/"Tasks", or a
 * "Show/Open/Go to <section>" phrasing (the brief's own "Show today's
 * meetings" placeholder resolves to /board/meetings this way). Anything
 * more sentence-like ("Generate proposal", "Prepare CRM report", "Find
 * manufacturing leads"...) intentionally falls through to the real
 * runAICommand call below instead of being misrouted to a static page —
 * those all name a *task* for an agent to do, not a destination to jump to.
 */
function tryMatchNavigationCommand(commandText: string): CommandDefinition | null {
  const trimmed = commandText.trim().toLowerCase();
  if (!trimmed) return null;

  const navigable = NAV_COMMANDS.filter((command) => command.href);

  for (const command of navigable) {
    if (command.keywords.includes(trimmed)) return command;
  }

  for (const prefix of NAV_TRIGGER_PREFIXES) {
    if (!trimmed.startsWith(prefix)) continue;
    const rest = trimmed.slice(prefix.length).trim();
    for (const command of navigable) {
      if (command.keywords.some((kw) => rest === kw || rest.includes(kw))) return command;
    }
  }

  return null;
}

/**
 * Prominent, standalone AI Command Bar — embeddable on the dashboard home
 * page. On submit: deterministic nav commands navigate immediately (no AI
 * call, no cost); everything else calls runAICommandBar (a real, billable
 * Claude call via src/lib/commands.ts's runAICommand) and renders the
 * result — or the honest not-connected/billing error — below the bar.
 */
export function AICommandBar({ className }: { className?: string }) {
  const router = useRouter();
  const [value, setValue] = React.useState("");
  const [placeholderIndex, setPlaceholderIndex] = React.useState(0);
  const [answerState, setAnswerState] = React.useState<AIAnswerState | null>(null);
  const [submittedText, setSubmittedText] = React.useState("");
  const [isPending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (value) return; // stop rotating once the user starts typing
    const id = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDER_EXAMPLES.length);
    }, 2800);
    return () => clearInterval(id);
  }, [value]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || isPending) return;

    const navCommand = tryMatchNavigationCommand(trimmed);
    if (navCommand?.href) {
      router.push(navCommand.href);
      setValue("");
      setAnswerState(null);
      return;
    }

    setSubmittedText(trimmed);
    setAnswerState({ status: "loading" });
    startTransition(async () => {
      const response = await runAICommandBar(trimmed);
      if (response.ok) {
        setAnswerState({ status: "result", content: response.content ?? "" });
      } else {
        setAnswerState({
          status: "error",
          message: response.error ?? "Something went wrong.",
          kind: response.errorKind,
        });
      }
    });
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <form onSubmit={handleSubmit}>
        <motion.div
          animate={isPending ? glowPulse.animate : undefined}
          className={cn(
            "flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 shadow-card transition-colors",
            isPending && "border-primary/40",
          )}
        >
          <Sparkles className={cn("size-5 shrink-0 text-primary", isPending && "animate-pulse")} />
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={`Try: "${PLACEHOLDER_EXAMPLES[placeholderIndex]}"`}
            disabled={isPending}
            className="h-7 w-full min-w-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none disabled:opacity-60 sm:text-base"
            aria-label="Ask the AI workforce"
          />
          <Button type="submit" size="sm" disabled={isPending || !value.trim()} className="shrink-0">
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
            <span className="hidden sm:inline">{isPending ? "Thinking…" : "Run"}</span>
          </Button>
        </motion.div>
      </form>

      {answerState && <AIAnswerPanel state={answerState} commandText={submittedText} />}
    </div>
  );
}
