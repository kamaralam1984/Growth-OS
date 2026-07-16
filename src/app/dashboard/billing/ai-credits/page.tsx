import { Sparkles, Infinity as InfinityIcon, Wallet } from "lucide-react";

import { Container } from "@/components/ui/container";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { getAICreditAvailability } from "@/lib/billing/ai-credits";
import type { AIUsageProvider } from "@/generated/prisma/client";
import { requireActiveMembership } from "../../_lib/require-membership";
import { RequestCreditsForm } from "./_components/request-credits-form";

const BREAKDOWN_DAYS = 30;

const PROVIDER_LABELS: Record<AIUsageProvider, string> = {
  ANTHROPIC: "Anthropic (Claude)",
  OPENAI: "OpenAI",
  GOOGLE_GEMINI: "Google Gemini",
  GROQ: "Groq",
  EMBEDDING: "Embeddings",
};

function formatCredits(value: number): string {
  return (Math.round(value * 100) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default async function AICreditsPage() {
  const { membership } = await requireActiveMembership("/dashboard/billing/ai-credits");
  const organizationId = membership.organizationId;

  const since = new Date();
  since.setDate(since.getDate() - BREAKDOWN_DAYS);

  const [availability, breakdown] = await Promise.all([
    getAICreditAvailability(organizationId),
    prisma.aIUsageEvent.groupBy({
      by: ["provider"],
      where: { organizationId, createdAt: { gte: since } },
      _sum: { creditsUsed: true },
      _count: { _all: true },
      orderBy: { _sum: { creditsUsed: "desc" } },
    }),
  ]);

  const usedPct =
    availability.unlimited || availability.monthlyCreditsGranted <= 0
      ? 0
      : Math.min(100, (availability.monthlyCreditsUsed / availability.monthlyCreditsGranted) * 100);
  const isNearLimit = usedPct >= 80 && usedPct < 100;
  const isOverLimit = !availability.unlimited && availability.monthlyCreditsGranted > 0 && availability.monthlyCreditsUsed >= availability.monthlyCreditsGranted;
  const barColorClass = isOverLimit ? "bg-red-500" : isNearLimit ? "bg-amber-500" : "bg-primary";

  const totalCreditsInWindow = breakdown.reduce((sum, row) => sum + (row._sum.creditsUsed ?? 0), 0);

  return (
    <main className="py-8">
      <Container className="flex flex-col gap-6">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
            <Sparkles className="size-5" /> AI Credits
          </h1>
          <p className="text-sm text-muted-foreground">
            Real credit balance from your organization&rsquo;s AICreditLedger, and a real breakdown of every metered
            AI/embedding call from AIUsageEvent.
          </p>
        </div>

        <Card glass>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="size-4" /> Credit balance
            </CardTitle>
            <CardDescription>
              {availability.unlimited
                ? "Your plan includes unlimited AI credits."
                : `${formatCredits(availability.monthlyCreditsUsed)} of ${formatCredits(availability.monthlyCreditsGranted)} monthly credits used`}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {availability.unlimited ? (
              <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-foreground">
                <InfinityIcon className="size-5 shrink-0 text-primary" />
                <span>Unlimited — this organization&rsquo;s current plan has no monthly AI-credit cap.</span>
              </div>
            ) : (
              <>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-[width] ${barColorClass}`}
                    style={{ width: `${Math.max(usedPct, availability.monthlyCreditsUsed > 0 ? 4 : 0)}%` }}
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Monthly granted</p>
                    <p className="text-xl font-semibold text-foreground">{formatCredits(availability.monthlyCreditsGranted)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Monthly used</p>
                    <p className={`text-xl font-semibold ${isOverLimit ? "text-red-500" : "text-foreground"}`}>
                      {formatCredits(availability.monthlyCreditsUsed)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Purchased credits remaining</p>
                    <p className="text-xl font-semibold text-foreground">{formatCredits(availability.purchasedCreditsRemaining)}</p>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card glass>
          <CardHeader>
            <CardTitle className="text-base">Request more credits</CardTitle>
            <CardDescription>
              Sends a real in-app notification to this organization&rsquo;s owners and admins — this does not charge a
              card or instantly grant credits.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RequestCreditsForm organizationId={organizationId} />
          </CardContent>
        </Card>

        <Card glass>
          <CardHeader>
            <CardTitle className="text-base">Usage by provider</CardTitle>
            <CardDescription>Real AIUsageEvent rows grouped by provider, last {BREAKDOWN_DAYS} days.</CardDescription>
          </CardHeader>
          <CardContent>
            {breakdown.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No AI usage recorded yet in the last {BREAKDOWN_DAYS} days.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead className="text-right">Calls</TableHead>
                    <TableHead className="text-right">Credits used</TableHead>
                    <TableHead className="text-right">Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {breakdown.map((row) => {
                    const credits = row._sum.creditsUsed ?? 0;
                    const share = totalCreditsInWindow > 0 ? (credits / totalCreditsInWindow) * 100 : 0;
                    return (
                      <TableRow key={row.provider}>
                        <TableCell className="font-medium text-foreground">{PROVIDER_LABELS[row.provider]}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{row._count._all.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{formatCredits(credits)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{share.toFixed(1)}%</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </Container>
    </main>
  );
}
