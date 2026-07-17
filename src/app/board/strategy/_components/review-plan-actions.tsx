"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Archive } from "lucide-react";

import { Button } from "@/components/ui/button";
import { reviewPlan } from "../actions";

export function ReviewPlanActions({ planId }: { planId: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function handle(decision: "ACTIVE" | "ARCHIVED") {
    startTransition(async () => {
      await reviewPlan(planId, decision);
      router.refresh();
    });
  }

  return (
    <div className="flex gap-2">
      <Button type="button" size="sm" onClick={() => handle("ACTIVE")} disabled={pending}>
        <CheckCircle2 className="size-4" /> Activate
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={() => handle("ARCHIVED")} disabled={pending}>
        <Archive className="size-4" /> Archive
      </Button>
    </div>
  );
}
