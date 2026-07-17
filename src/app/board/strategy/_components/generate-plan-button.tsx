"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AiErrorBanner, type AIErrorKind } from "@/app/board/_components/ai-error-banner";
import { generatePlan } from "../actions";
import type { StrategicPlanHorizon } from "@/generated/prisma/client";

export function GeneratePlanButton({ horizon, label }: { horizon: StrategicPlanHorizon; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<{ message: string; kind: AIErrorKind } | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await generatePlan(horizon);
      if (!result.ok) {
        setError({ message: result.error ?? "Something went wrong.", kind: (result.errorKind as AIErrorKind) ?? "generic" });
        return;
      }
      if (result.planId) router.push(`/board/strategy/${result.planId}`);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" size="sm" variant="outline" onClick={handleClick} disabled={pending}>
        <Sparkles className={pending ? "size-4 animate-pulse" : "size-4"} />
        {pending ? "Generating…" : `Generate ${label} plan`}
      </Button>
      {error && <AiErrorBanner error={error.message} kind={error.kind} />}
    </div>
  );
}
