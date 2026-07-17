import { ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { ChurnRiskAssessment } from "@/generated/prisma/client";
import type { ChurnReason } from "@/lib/clients/churn";

const RISK_LEVEL_CLASS: Record<string, string> = {
  LOW: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  MEDIUM: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  HIGH: "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400",
  CRITICAL: "border-destructive/30 bg-destructive/10 text-destructive",
};

const FACTOR_LABEL: Record<string, string> = {
  engagement: "Engagement recency",
  payment: "Payment behavior",
  contract: "Contract / renewal",
  delivery: "Project delivery",
};

export function ClientChurnCard({ assessment }: { assessment: ChurnRiskAssessment }) {
  const reasons = (assessment.reasons as unknown as ChurnReason[] | null) ?? [];
  const sortedReasons = [...reasons].sort((a, b) => b.contribution - a.contribution);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-semibold text-foreground">{assessment.probabilityScore}%</span>
          <span className="text-sm text-muted-foreground">real churn probability (deterministic, {assessment.confidenceScore}% data confidence)</span>
        </div>
        <Badge variant="outline" className={RISK_LEVEL_CLASS[assessment.riskLevel]}>
          {assessment.riskLevel}
        </Badge>
      </div>

      {sortedReasons.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Deterministic factor breakdown</p>
          {sortedReasons.map((reason) => (
            <div key={reason.factor} className="flex items-center justify-between text-sm">
              <span className="text-foreground">{FACTOR_LABEL[reason.factor] ?? reason.factor}</span>
              <span className="text-muted-foreground">
                score {reason.value}/100 · +{reason.contribution} pts to churn probability
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {assessment.aiNarrative ? (
        <div className="flex flex-col gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
            <ShieldAlert className="size-3.5" /> AI-generated narrative — grounded in the factors above, not independent fact
          </p>
          <p className="text-sm text-foreground">{assessment.aiNarrative}</p>
          {assessment.recommendedActions.length > 0 ? (
            <ul className="list-inside list-disc text-sm text-muted-foreground">
              {assessment.recommendedActions.map((action, i) => (
                <li key={i}>{action}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
