"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Target,
  DollarSign,
  Activity,
  TrendingUp,
  Building2,
  ArrowRight,
  RefreshCw,
  Sparkles,
  Tag,
  PlusCircle,
  Layers,
  Share2,
  Clock,
  AlertTriangle,
  ListChecks,
  FileCheck2,
  Trophy,
  ClipboardList,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AiErrorBanner, type AIErrorKind } from "@/app/board/_components/ai-error-banner";
import { glowPulse } from "@/animations";
import type { Recommendation, RecommendationType } from "@/generated/prisma/client";
import { refreshRecommendations } from "../_lib/recommendations-actions";

const REC_ICONS: Record<RecommendationType, React.ComponentType<{ className?: string }>> = {
  BEST_OPPORTUNITY: Target,
  HIGHEST_VALUE_LEAD: DollarSign,
  MOST_ACTIVE_COMPANY: Activity,
  FASTEST_GROWING_COMPANY: TrendingUp,
  RECOMMENDED_INDUSTRY: Building2,
  SUGGESTED_NEXT_STEP: ArrowRight,
  BETTER_PRICING: Tag,
  ADDITIONAL_SERVICES: PlusCircle,
  UPSELL_OPPORTUNITY: Layers,
  CROSS_SELL_OPPORTUNITY: Share2,
  BETTER_TIMELINE: Clock,
  RISK_WARNING: AlertTriangle,
  SCOPE_IMPROVEMENT: ListChecks,
  PROPOSAL_QUALITY_IMPROVEMENT: FileCheck2,
  COMPETITIVE_ADVANTAGE: Trophy,
  DELIVERY_RECOMMENDATION: ClipboardList,
};

const REC_LABELS: Record<RecommendationType, string> = {
  BEST_OPPORTUNITY: "Best opportunity",
  HIGHEST_VALUE_LEAD: "Highest-value lead",
  MOST_ACTIVE_COMPANY: "Most active company",
  FASTEST_GROWING_COMPANY: "Fastest-growing company",
  RECOMMENDED_INDUSTRY: "Recommended industry",
  SUGGESTED_NEXT_STEP: "Suggested next step",
  BETTER_PRICING: "Better pricing",
  ADDITIONAL_SERVICES: "Additional services",
  UPSELL_OPPORTUNITY: "Upsell opportunity",
  CROSS_SELL_OPPORTUNITY: "Cross-sell opportunity",
  BETTER_TIMELINE: "Better timeline",
  RISK_WARNING: "Risk warning",
  SCOPE_IMPROVEMENT: "Scope improvement",
  PROPOSAL_QUALITY_IMPROVEMENT: "Proposal quality improvement",
  COMPETITIVE_ADVANTAGE: "Competitive advantage",
  DELIVERY_RECOMMENDATION: "Delivery recommendation",
};

type RecommendationView = Recommendation & { relatedCompany: { id: string; name: string } | null };

export function RecommendationsPanel({ initialRecommendations }: { initialRecommendations: RecommendationView[] }) {
  const [recommendations, setRecommendations] = React.useState(initialRecommendations);
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<{ message: string; kind: AIErrorKind } | null>(null);

  function handleRefresh() {
    setError(null);
    startTransition(async () => {
      const result = await refreshRecommendations();
      if (!result.ok) {
        setError({ message: result.error ?? "Something went wrong.", kind: result.errorKind });
        return;
      }
      setRecommendations(result.recommendations ?? []);
    });
  }

  return (
    <Card glass>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">AI Recommendations</CardTitle>
          <CardDescription>Real, data-grounded suggestions from your Sales agent — never fabricated.</CardDescription>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={handleRefresh} disabled={isPending}>
          <motion.span animate={isPending ? glowPulse.animate : undefined} className="flex items-center gap-1.5">
            <RefreshCw className={isPending ? "size-4 animate-spin" : "size-4"} />
            {isPending ? "Generating…" : "Refresh"}
          </motion.span>
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error && <AiErrorBanner error={error.message} kind={error.kind} />}

        {recommendations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No recommendations generated yet. Click &ldquo;Refresh&rdquo; to have your Sales agent analyze your real
            lead and company data.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {recommendations.map((rec) => {
              const Icon = REC_ICONS[rec.type];
              return (
                <div key={rec.id} className="flex flex-col gap-1.5 rounded-xl border border-border p-4">
                  <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-primary">
                    <Icon className="size-3.5" />
                    {REC_LABELS[rec.type]}
                  </span>
                  <p className="text-sm font-medium text-foreground">{rec.title}</p>
                  <p className="text-xs text-muted-foreground">{rec.description}</p>
                  {rec.relatedCompany && (
                    <Link
                      href={`/dashboard/companies/${rec.relatedCompany.id}`}
                      className="mt-1 flex w-fit items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <Sparkles className="size-3" /> {rec.relatedCompany.name}
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
