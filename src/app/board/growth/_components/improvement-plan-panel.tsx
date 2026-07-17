"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, BrainCircuit } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { generateImprovementPlan } from "../actions";

export interface ImprovementPlanRecommendation {
  title: string;
  description: string;
  axis: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
}

export interface ImprovementPlanData {
  id: string;
  narrativeSummary: string;
  recommendations: ImprovementPlanRecommendation[];
  confidenceScore: number;
  createdAt: string;
}

const PRIORITY_VARIANT: Record<string, "outline" | "accent" | "default" | "secondary"> = {
  LOW: "outline",
  MEDIUM: "accent",
  HIGH: "secondary",
};

export function ImprovementPlanPanel({ plan }: { plan: ImprovementPlanData | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      const result = await generateImprovementPlan();
      if (!result.ok) {
        setError(result.error ?? "Something went wrong generating the plan.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card glass>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <BrainCircuit className="size-4 text-primary" /> AI Business Analyst — Improvement Plan
            </CardTitle>
            <CardDescription>Grounded strictly in today&apos;s real Growth Score axes above — one AI reasoning pass, never invented metrics.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleGenerate} disabled={pending}>
            <Sparkles className="size-4" />
            {pending ? "Generating…" : plan ? "Regenerate" : "Generate plan"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && <p className="text-sm text-destructive">{error}</p>}

        {!plan ? (
          <p className="text-sm text-muted-foreground">No improvement plan generated yet. Click &quot;Generate plan&quot; for an AI-authored read of today&apos;s Growth Score.</p>
        ) : (
          <>
            <p className="text-sm text-foreground">{plan.narrativeSummary}</p>
            <div className="flex flex-col gap-2">
              {plan.recommendations.map((rec, i) => (
                <div key={`${plan.id}-${i}`} className="flex flex-col gap-1 rounded-lg border border-border/60 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{rec.title}</span>
                    <Badge variant="outline" className="text-xs">
                      {rec.axis}
                    </Badge>
                    <Badge variant={PRIORITY_VARIANT[rec.priority] ?? "outline"} className="text-xs">
                      {rec.priority}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{rec.description}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Confidence {plan.confidenceScore}/100 · Generated {new Date(plan.createdAt).toLocaleString()}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
