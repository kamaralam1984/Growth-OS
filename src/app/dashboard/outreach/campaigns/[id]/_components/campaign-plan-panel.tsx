"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AiErrorBanner, type AIErrorKind } from "@/app/board/_components/ai-error-banner";
import { generateCampaignPlan } from "../../../_lib/campaign-actions";

export function CampaignPlanPanel({ campaignId, aiPlanNotes, estimatedSuccessPotential }: { campaignId: string; aiPlanNotes: string | null; estimatedSuccessPotential: number | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<AIErrorKind>(undefined);

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      const result = await generateCampaignPlan(campaignId);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        setErrorKind(result.errorKind);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card glass>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-primary" /> AI Campaign Planner
        </CardTitle>
        <Button size="sm" variant="outline" onClick={handleGenerate} disabled={pending}>
          {pending ? "Planning…" : aiPlanNotes ? "Refresh plan" : "Generate plan"}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-0">
        {error && <AiErrorBanner error={error} kind={errorKind} />}
        {estimatedSuccessPotential != null && (
          <Badge variant="accent" className="w-fit">
            Estimated success potential: {estimatedSuccessPotential}% (deterministic, from real matching-contact data)
          </Badge>
        )}
        {aiPlanNotes ? (
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{aiPlanNotes}</p>
        ) : (
          <p className="text-sm text-muted-foreground">No plan generated yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
