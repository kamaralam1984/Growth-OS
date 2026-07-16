"use client";

import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import { RefreshCw, Tag, PlusCircle, Layers, Share2, Clock, AlertTriangle, Sparkles } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AiErrorBanner, type AIErrorKind } from "@/app/board/_components/ai-error-banner";
import { glowPulse } from "@/animations";
import { refreshProposalRecommendations } from "../../../actions";
import type { RecommendationType } from "@/generated/prisma/client";

const ICONS: Partial<Record<RecommendationType, React.ComponentType<{ className?: string }>>> = {
  BETTER_PRICING: Tag,
  ADDITIONAL_SERVICES: PlusCircle,
  UPSELL_OPPORTUNITY: Layers,
  CROSS_SELL_OPPORTUNITY: Share2,
  BETTER_TIMELINE: Clock,
  RISK_WARNING: AlertTriangle,
};

export interface ProposalRecommendation {
  id: string;
  type: RecommendationType;
  title: string;
  description: string;
}

export function ProposalRecommendationsPanel({ proposalId, initialRecommendations }: { proposalId: string; initialRecommendations: ProposalRecommendation[] }) {
  const [recommendations, setRecommendations] = useState(initialRecommendations);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<{ message: string; kind?: AIErrorKind } | null>(null);

  function handleRefresh() {
    setError(null);
    startTransition(async () => {
      const result = await refreshProposalRecommendations(proposalId);
      if (!result.ok) {
        setError({ message: result.error ?? "Something went wrong.", kind: result.errorKind });
        return;
      }
      setRecommendations((result.recommendations ?? []) as ProposalRecommendation[]);
    });
  }

  return (
    <Card glass>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">AI Recommendations</CardTitle>
          <CardDescription>Better pricing, upsell/cross-sell, timeline, or a risk to flag — grounded in this real proposal.</CardDescription>
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
        {recommendations.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recommendations yet. Click &ldquo;Refresh&rdquo; to have AI review this proposal.</p>
        ) : (
          recommendations.map((rec) => {
            const Icon = ICONS[rec.type] ?? Sparkles;
            return (
              <div key={rec.id} className="rounded-lg border border-border p-3 text-sm">
                <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-primary">
                  <Icon className="size-3.5" />
                  {rec.type.replace(/_/g, " ").toLowerCase()}
                </span>
                <p className="mt-1 font-medium text-foreground">{rec.title}</p>
                <p className="text-xs text-muted-foreground">{rec.description}</p>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
