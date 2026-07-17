import Link from "next/link";
import { redirect } from "next/navigation";
import { Target } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatRelativeTime } from "@/lib/utils";
import { GeneratePlanButton } from "./_components/generate-plan-button";
import type { StrategicPlanHorizon, StrategicPlanStatus } from "@/generated/prisma/client";

const HORIZONS: Array<{ value: StrategicPlanHorizon; label: string }> = [
  { value: "DAYS_30", label: "30-day" },
  { value: "DAYS_90", label: "90-day" },
  { value: "DAYS_180", label: "6-month" },
  { value: "DAYS_365", label: "12-month" },
];

const STATUS_VARIANT: Record<StrategicPlanStatus, "default" | "secondary" | "outline" | "accent"> = {
  DRAFT: "outline",
  ACTIVE: "default",
  ARCHIVED: "secondary",
};

export default async function StrategyPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=%2Fboard%2Fstrategy");
  }
  const userId = session.user.id;

  const membership = await prisma.membership.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
  if (!membership) {
    redirect("/onboarding");
  }
  const organizationId = membership.organizationId;

  const plans = await prisma.strategicPlan.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } });

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Strategic Planning</h1>
          <p className="text-sm text-muted-foreground">
            AI-generated growth plans, grounded in your real Growth Score, pipeline, revenue forecast, insights, and
            active risks. Generated on demand — never a silent background regeneration. New plans start as Draft
            until an owner reviews and activates them.
          </p>
        </div>

        <Card glass>
          <CardHeader>
            <CardTitle className="text-base">Generate a new plan</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {HORIZONS.map((h) => (
              <GeneratePlanButton key={h.value} horizon={h.value} label={h.label} />
            ))}
          </CardContent>
        </Card>

        {plans.length === 0 ? (
          <Card glass>
            <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
              <Target className="size-8 text-muted-foreground" strokeWidth={1.5} />
              <p className="text-sm text-muted-foreground">No strategic plans generated yet.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {plans.map((plan) => (
              <Link key={plan.id} href={`/board/strategy/${plan.id}`}>
                <Card glass className="h-full transition-colors hover:border-primary/40">
                  <CardContent className="flex flex-col gap-2 p-5">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline">{HORIZONS.find((h) => h.value === plan.horizon)?.label}</Badge>
                      <Badge variant={STATUS_VARIANT[plan.status]}>{plan.status}</Badge>
                    </div>
                    <p className="font-medium text-foreground">{plan.title}</p>
                    <CardDescription>{formatRelativeTime(plan.createdAt)} · Confidence {plan.confidenceScore}/100</CardDescription>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </Container>
    </main>
  );
}
