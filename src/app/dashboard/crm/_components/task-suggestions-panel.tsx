"use client";

import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import { RefreshCw, AlertTriangle, Zap } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AiErrorBanner, type AIErrorKind } from "@/app/board/_components/ai-error-banner";
import { glowPulse } from "@/animations";
import { refreshTaskSuggestions } from "../_lib/task-actions";
import type { TaskEngineSuggestions } from "@/lib/ai/task-engine";

/** AI Task Engine panel — real Claude call grounded in this org's open tasks (see src/lib/ai/task-engine.ts), never fabricated. */
export function TaskSuggestionsPanel() {
  const [suggestions, setSuggestions] = useState<TaskEngineSuggestions | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<{ message: string; kind?: AIErrorKind } | null>(null);

  function handleRefresh() {
    setError(null);
    startTransition(async () => {
      const result = await refreshTaskSuggestions();
      if (!result.ok) {
        setError({ message: result.error ?? "Something went wrong.", kind: result.errorKind });
        return;
      }
      setSuggestions(result.suggestions ?? null);
    });
  }

  return (
    <Card glass>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">AI Task Engine</CardTitle>
          <CardDescription>Next task, priority, blocked-task detection, and automation opportunities — grounded in your real open tasks.</CardDescription>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={handleRefresh} disabled={isPending}>
          <motion.span animate={isPending ? glowPulse.animate : undefined} className="flex items-center gap-1.5">
            <RefreshCw className={isPending ? "size-4 animate-spin" : "size-4"} />
            {isPending ? "Analyzing…" : "Refresh"}
          </motion.span>
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error && <AiErrorBanner error={error.message} kind={error.kind} />}

        {!suggestions ? (
          <p className="text-sm text-muted-foreground">Click &ldquo;Refresh&rdquo; to have AI analyze your open tasks.</p>
        ) : suggestions.suggestions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{suggestions.nextBestAction}</p>
        ) : (
          <>
            <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <Zap className="size-4 text-primary" /> {suggestions.nextBestAction}
            </p>
            <div className="flex flex-col gap-2">
              {suggestions.suggestions.map((s) => (
                <div key={s.taskId} className="rounded-lg border border-border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-foreground">{s.title}</p>
                    <div className="flex items-center gap-1.5">
                      {s.isBlocked && (
                        <Badge variant="outline" className="text-amber-500">
                          <AlertTriangle className="size-3" /> Blocked
                        </Badge>
                      )}
                      <Badge variant="accent">{s.suggestedPriority}</Badge>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{s.reasoning}</p>
                  {s.blockedReason && <p className="mt-1 text-xs text-amber-500">{s.blockedReason}</p>}
                  {s.automationOpportunity && <p className="mt-1 text-xs text-primary">Automation idea: {s.automationOpportunity}</p>}
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
