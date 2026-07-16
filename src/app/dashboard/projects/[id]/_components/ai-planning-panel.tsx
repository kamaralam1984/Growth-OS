"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AiErrorBanner, type AIErrorKind } from "@/app/board/_components/ai-error-banner";
import { runProjectDailyPlanning } from "../_lib/ai-actions";

export function AiPlanningPanel({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<{ message: string; kind?: AIErrorKind } | null>(null);
  const [result, setResult] = useState<{ summary: string; priorities: string[]; recommendations: string[] } | null>(null);

  function handleRun() {
    setError(null);
    startTransition(async () => {
      const res = await runProjectDailyPlanning(projectId);
      if (!res.ok) {
        setError({ message: res.error ?? "Something went wrong.", kind: res.errorKind });
        return;
      }
      setResult({ summary: res.summary ?? "", priorities: res.priorities ?? [], recommendations: res.recommendations ?? [] });
    });
  }

  return (
    <Card glass>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4" /> AI Project Manager
          </CardTitle>
          <CardDescription>Real deterministic risk scan + one real Claude call reviewing this project — never fabricated.</CardDescription>
        </div>
        {canManage && (
          <Button type="button" size="sm" onClick={handleRun} disabled={pending}>
            {pending ? "Planning…" : "Run daily planning"}
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error && <AiErrorBanner error={error.message} kind={error.kind} />}
        {!result && !error && <p className="text-sm text-muted-foreground">Run daily planning to get a real, grounded summary of priorities and risks for this project.</p>}
        {result && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-foreground">{result.summary}</p>
            {result.priorities.length > 0 && (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Priorities</p>
                <ul className="mt-1 flex flex-col gap-1 text-xs text-muted-foreground">
                  {result.priorities.map((p, i) => (
                    <li key={i}>• {p}</li>
                  ))}
                </ul>
              </div>
            )}
            {result.recommendations.length > 0 && (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Recommendations</p>
                <ul className="mt-1 flex flex-col gap-1 text-xs text-muted-foreground">
                  {result.recommendations.map((r, i) => (
                    <li key={i}>• {r}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
