"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LeadScoreBadge } from "@/app/dashboard/_components/lead-score-badge";
import { rescoreCompany } from "../_lib/intelligence-actions";
import type { LeadScoreBand } from "@/generated/prisma/client";

export interface LeadScorePanelProps {
  companyId: string;
  score: {
    overallScore: number;
    band: LeadScoreBand;
    industryMatchScore: number;
    companySizeScore: number;
    growthScore: number;
    technologyFitScore: number;
    opportunitySizeScore: number;
    budgetPotentialScore: number;
    locationScore: number;
    digitalMaturityScore: number;
    automationNeedScore: number;
    scoredAt: string;
  } | null;
}

const SUB_SCORES: Array<{ key: keyof NonNullable<LeadScorePanelProps["score"]>; label: string }> = [
  { key: "industryMatchScore", label: "Industry match" },
  { key: "companySizeScore", label: "Company size" },
  { key: "growthScore", label: "Growth" },
  { key: "technologyFitScore", label: "Technology fit" },
  { key: "opportunitySizeScore", label: "Opportunity size" },
  { key: "budgetPotentialScore", label: "Budget potential" },
  { key: "locationScore", label: "Location match" },
  { key: "digitalMaturityScore", label: "Digital maturity" },
  { key: "automationNeedScore", label: "Automation need" },
];

export function LeadScorePanel({ companyId, score }: LeadScorePanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleRescore() {
    startTransition(async () => {
      await rescoreCompany(companyId);
      router.refresh();
    });
  }

  return (
    <Card glass>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          Lead score
          {score && <LeadScoreBadge band={score.band} score={score.overallScore} />}
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={handleRescore} disabled={pending}>
          <RefreshCw className={pending ? "size-4 animate-spin" : "size-4"} />
          {pending ? "Scoring…" : "Rescore"}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-0">
        {!score ? (
          <p className="text-xs text-muted-foreground">Not scored yet. Click Rescore to compute a deterministic lead score.</p>
        ) : (
          <>
            {SUB_SCORES.map(({ key, label }) => {
              const value = score[key] as number;
              return (
                <div key={key} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">{label}</span>
                    <span className="text-muted-foreground">{value}</span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.max(value, value > 0 ? 4 : 0)}%` }}
                    />
                  </div>
                </div>
              );
            })}
            <p className="text-[11px] text-muted-foreground">
              Computed deterministically from stored data — last scored {new Date(score.scoredAt).toLocaleString()}.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
