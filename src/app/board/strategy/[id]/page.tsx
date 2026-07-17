import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, Target } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Container } from "@/components/ui/container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatRelativeTime } from "@/lib/utils";
import { ReviewPlanActions } from "../_components/review-plan-actions";
import type { StrategicPlanStatus } from "@/generated/prisma/client";

const STATUS_VARIANT: Record<StrategicPlanStatus, "default" | "secondary" | "outline" | "accent"> = {
  DRAFT: "outline",
  ACTIVE: "default",
  ARCHIVED: "secondary",
};

interface Goal {
  title: string;
  description: string;
  targetMetric: string | null;
  targetValue: string | null;
}

export default async function StrategicPlanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=%2Fboard%2Fstrategy%2F${id}`);
  }
  const userId = session.user.id;

  const membership = await prisma.membership.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
  if (!membership) {
    redirect("/onboarding");
  }

  const plan = await prisma.strategicPlan.findUnique({ where: { id } });
  if (!plan || plan.organizationId !== membership.organizationId) {
    notFound();
  }

  const canReview = membership.role === "OWNER" || membership.role === "ADMIN";
  const goals = (plan.goals as unknown as Goal[] | null) ?? [];

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <Link href="/board/strategy" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to Strategic Planning
        </Link>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{plan.title}</h1>
            <p className="text-sm text-muted-foreground">
              Generated {formatRelativeTime(plan.createdAt)} · Confidence {plan.confidenceScore}/100
              {plan.reviewedAt ? ` · Reviewed ${formatRelativeTime(plan.reviewedAt)}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={STATUS_VARIANT[plan.status]}>{plan.status}</Badge>
            {canReview && plan.status === "DRAFT" && <ReviewPlanActions planId={plan.id} />}
          </div>
        </div>

        <Card glass>
          <CardHeader>
            <CardTitle className="text-base">Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground">{plan.narrativeSummary}</p>
          </CardContent>
        </Card>

        <Card glass>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="size-4 text-primary" /> Goals
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {goals.map((goal, i) => (
              <div key={i} className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium text-foreground">{goal.title}</p>
                <p className="text-sm text-muted-foreground">{goal.description}</p>
                {goal.targetMetric && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Target: {goal.targetMetric} {goal.targetValue ? `→ ${goal.targetValue}` : ""}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </Container>
    </main>
  );
}
