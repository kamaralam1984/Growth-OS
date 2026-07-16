"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { updateBillingPlan } from "../actions";

const PLANS = [
  { value: "FREE", label: "Free", seats: 5, blurb: "Get started with the essentials." },
  { value: "STARTER", label: "Starter", seats: 15, blurb: "For small growing teams." },
  { value: "GROWTH", label: "Growth", seats: 50, blurb: "Full AI Executive Board at scale." },
  { value: "ENTERPRISE", label: "Enterprise", seats: 250, blurb: "Custom limits, dedicated support." },
] as const;

export function PlanSelector({ currentPlan, canManage }: { currentPlan: string; canManage: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {PLANS.map((plan) => {
        const active = plan.value === currentPlan;
        return (
          <Card key={plan.value} glass className={active ? "border-primary/50" : ""}>
            <CardContent className="flex flex-col gap-2 p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium text-foreground">{plan.label}</p>
                {active && <Badge>Current</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">{plan.blurb}</p>
              <p className="text-xs text-muted-foreground">{plan.seats} seats included</p>
              {canManage && !active && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await updateBillingPlan(plan.value);
                      router.refresh();
                    })
                  }
                  className="mt-1 rounded-lg border border-border py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
                >
                  Switch to {plan.label}
                </button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
