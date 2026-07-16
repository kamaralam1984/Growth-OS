"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Target, AlertTriangle, TrendingUp, Handshake, Megaphone, Zap, RefreshCw, Sparkles } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AiErrorBanner, type AIErrorKind } from "@/app/board/_components/ai-error-banner";
import { glowPulse } from "@/animations";
import type { Insight, InsightType } from "@/generated/prisma/client";

import { refreshExecutiveInsights } from "./dashboard-actions";

const INSIGHT_ICONS: Record<InsightType, React.ComponentType<{ className?: string }>> = {
  TOP_OPPORTUNITY: Target,
  HIGHEST_PRIORITY: Zap,
  RISK_ALERT: AlertTriangle,
  GROWTH_SUGGESTION: TrendingUp,
  SALES_SUGGESTION: Handshake,
  MARKETING_SUGGESTION: Megaphone,
  PRODUCTIVITY_SUGGESTION: Sparkles,
};

const INSIGHT_LABELS: Record<InsightType, string> = {
  TOP_OPPORTUNITY: "Top opportunity",
  HIGHEST_PRIORITY: "Highest priority",
  RISK_ALERT: "Risk alert",
  GROWTH_SUGGESTION: "Growth suggestion",
  SALES_SUGGESTION: "Sales suggestion",
  MARKETING_SUGGESTION: "Marketing suggestion",
  PRODUCTIVITY_SUGGESTION: "Productivity suggestion",
};

export function ExecutiveInsights({ initialInsights }: { initialInsights: Insight[] }) {
  const [insights, setInsights] = React.useState(initialInsights);
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<{ message: string; kind: AIErrorKind } | null>(null);

  function handleRefresh() {
    setError(null);
    startTransition(async () => {
      const result = await refreshExecutiveInsights();
      if (!result.ok) {
        setError({ message: result.error ?? "Something went wrong.", kind: result.errorKind });
        return;
      }
      setInsights(result.insights ?? []);
    });
  }

  return (
    <Card glass>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">Executive Insights</CardTitle>
          <CardDescription>Real, data-grounded insights from your CEO agent — never fabricated.</CardDescription>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={handleRefresh} disabled={isPending}>
          <motion.span animate={isPending ? glowPulse.animate : undefined} className="flex items-center gap-1.5">
            <RefreshCw className={isPending ? "size-4 animate-spin" : "size-4"} />
            {isPending ? "Generating…" : "Refresh insights"}
          </motion.span>
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error && <AiErrorBanner error={error.message} kind={error.kind} />}

        {insights.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No insights generated yet. Click &ldquo;Refresh insights&rdquo; to have your CEO agent analyze your real
            company data.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {insights.map((insight) => {
              const Icon = INSIGHT_ICONS[insight.type];
              return (
                <div key={insight.id} className="flex flex-col gap-1.5 rounded-xl border border-border p-4">
                  <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-primary">
                    <Icon className="size-3.5" />
                    {INSIGHT_LABELS[insight.type]}
                  </span>
                  <p className="text-sm font-medium text-foreground">{insight.title}</p>
                  <p className="text-xs text-muted-foreground">{insight.description}</p>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
